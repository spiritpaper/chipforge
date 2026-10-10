// Plays a ChipSongAsset through this GameObject's AudioSource. The chip renders on
// Unity's audio thread in OnAudioFilterRead; song events are raised on the main thread
// in Update. The AudioSource's volume, mixer group and 3D settings all apply.

using UnityEngine;
using UnityEngine.Events;

namespace ChipForge
{
    [RequireComponent(typeof(AudioSource))]
    [AddComponentMenu("Audio/ChipForge Song Player")]
    public class ChipSongPlayer : MonoBehaviour
    {
        public ChipSongAsset song;
        public bool playOnAwake = true;
        [Tooltip("Stop at the end of the song (and raise Finished) instead of looping.")]
        public bool playOnce;
        [Range(0.25f, 4f)] public float tempoScale = 1f;

        public UnityEvent finished = new UnityEvent();
        public UnityEvent<int> sectionChanged = new UnityEvent<int>();

        ChipForgePlayer _player;
        AudioSource _source;
        float _appliedTempo = -1f;
        bool _appliedPlayOnce;
        volatile bool _finished;
        volatile int _section = -1;
        int _reportedSection = -1;

        public bool IsPlaying => _player != null && _player.IsPlaying;
        public int Section => _player != null ? _player.Section : -1;

        void Awake()
        {
            _source = GetComponent<AudioSource>();
            // OnAudioFilterRead only runs while the source plays, so give it a silent
            // looping clip; the chip overwrites the samples.
            int rate = AudioSettings.outputSampleRate;
            _source.clip = AudioClip.Create("ChipForge", rate, 1, rate, false);
            _source.loop = true;
            _source.playOnAwake = false;
            _player = new ChipForgePlayer(rate);
            if (song != null) Load(song);
            ApplySettings();
            if (playOnAwake && song != null) Play();
        }

        public void Load(ChipSongAsset asset)
        {
            song = asset;
            try
            {
                _player.Load(asset.data);
            }
            catch (ChipForgeException e)
            {
                Debug.LogError($"ChipForge: {asset.name}: {e.Message}", this);
            }
        }

        public void Play(int section = 0)
        {
            ApplySettings();
            _player.Play(section);
            _reportedSection = section;
            if (!_source.isPlaying) _source.Play();
        }

        public void Stop() => _player?.Stop();

        /// <summary>Switches section when the current pattern ends, on the bar line.</summary>
        public void QueueSection(int section) => _player?.QueueSection(section);

        /// <summary>0 pulse 1, 1 pulse 2, 2 triangle, 3 noise.</summary>
        public void SetChannelMuted(int channel, bool muted) => _player?.SetChannelMuted(channel, muted);

        void ApplySettings()
        {
            if (_player == null) return;
            if (!Mathf.Approximately(tempoScale, _appliedTempo))
            {
                _player.SetTempoScale(tempoScale);
                _appliedTempo = tempoScale;
            }
            if (playOnce != _appliedPlayOnce)
            {
                _player.SetPlayOnce(playOnce);
                _appliedPlayOnce = playOnce;
            }
        }

        void Update()
        {
            ApplySettings();
            int section = _section;
            if (section >= 0 && section != _reportedSection)
            {
                _reportedSection = section;
                sectionChanged.Invoke(section);
            }
            if (_finished)
            {
                _finished = false;
                finished.Invoke();
            }
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            var player = _player;
            if (player == null) return;
            player.Render(data, channels);
            if (player.TakeFinished()) _finished = true;
            _section = player.Section;
        }

        void OnDestroy()
        {
            var player = _player;
            _player = null;
            player?.Dispose();
        }
    }
}
