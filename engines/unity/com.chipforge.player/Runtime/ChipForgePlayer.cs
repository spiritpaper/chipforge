// A ChipForge song player with no Unity dependency: usable from any .NET code.
// Thread-safe: control it from the main thread while Render runs on the audio thread.

using System;
using System.Runtime.InteropServices;

namespace ChipForge
{
    public sealed class ChipForgeException : Exception
    {
        public int Code { get; }
        public ChipForgeException(int code, string message) : base(message) => Code = code;
    }

    public sealed class ChipForgePlayer : IDisposable
    {
        /// <summary>The chip's channels: 0 pulse 1, 1 pulse 2, 2 triangle, 3 noise.</summary>
        public const int Channels = 4;
        const uint ExpectedApi = 1;

        readonly object _gate = new object();
        IntPtr _handle;

        public ChipForgePlayer(int sampleRate)
        {
            uint api = Native.chipforge_api_version();
            if (api != ExpectedApi)
                throw new ChipForgeException(0, $"chipforge native library has API {api}, expected {ExpectedApi}; update the plugin files together");
            _handle = Native.chipforge_player_new(sampleRate);
            if (_handle == IntPtr.Zero)
                throw new ChipForgeException(0, $"unsupported sample rate {sampleRate}");
        }

        public static string ErrorMessage(int code) =>
            Marshal.PtrToStringAnsi(Native.chipforge_error_message(code)) ?? "unknown error";

        /// <summary>Loads a .chipsong file's bytes. Throws ChipForgeException if they aren't a playable song.</summary>
        public void Load(byte[] song)
        {
            if (song == null) throw new ArgumentNullException(nameof(song));
            int code;
            lock (_gate) code = Native.chipforge_player_load(Handle, song, (UIntPtr)song.Length);
            if (code != 0) throw new ChipForgeException(code, ErrorMessage(code));
        }

        public void Play(int section = 0, int row = 0)
        {
            lock (_gate) Native.chipforge_player_play(Handle, (uint)Math.Max(0, section), (uint)Math.Max(0, row));
        }

        public void Stop()
        {
            lock (_gate) Native.chipforge_player_stop(Handle);
        }

        public bool IsPlaying { get { lock (_gate) return Native.chipforge_player_is_playing(Handle) != 0; } }

        /// <summary>The section (order entry) playing now, or -1 when stopped.</summary>
        public int Section { get { lock (_gate) return Native.chipforge_player_order(Handle); } }

        public int Row { get { lock (_gate) return Native.chipforge_player_row(Handle); } }

        public int SectionCount { get { lock (_gate) return (int)Native.chipforge_player_order_count(Handle); } }

        /// <summary>Times the song has looped since Play.</summary>
        public int Loops { get { lock (_gate) return (int)Native.chipforge_player_loops(Handle); } }

        /// <summary>Switches to a section when the current pattern ends, on the bar line.</summary>
        public void QueueSection(int section)
        {
            lock (_gate) Native.chipforge_player_queue_order(Handle, (uint)Math.Max(0, section));
        }

        public void SetChannelMuted(int channel, bool muted)
        {
            if (channel < 0 || channel >= Channels) throw new ArgumentOutOfRangeException(nameof(channel));
            lock (_gate) Native.chipforge_player_set_muted(Handle, (uint)channel, muted ? 1 : 0);
        }

        /// <summary>Tempo multiplier, 0.25 to 4.</summary>
        public void SetTempoScale(float scale)
        {
            lock (_gate) Native.chipforge_player_set_tempo_scale(Handle, scale);
        }

        /// <summary>Output gain, 0 to 2.</summary>
        public void SetVolume(float volume)
        {
            lock (_gate) Native.chipforge_player_set_volume(Handle, volume);
        }

        /// <summary>Stop at the end instead of looping (jingles); see TakeFinished.</summary>
        public void SetPlayOnce(bool on)
        {
            lock (_gate) Native.chipforge_player_set_play_once(Handle, on ? 1 : 0);
        }

        /// <summary>True once after a play-once song ends.</summary>
        public bool TakeFinished()
        {
            lock (_gate) return Native.chipforge_player_take_finished(Handle) != 0;
        }

        /// <summary>
        /// Fills an interleaved buffer (as Unity's OnAudioFilterRead provides) with
        /// buffer.Length / channels frames.
        /// </summary>
        public void Render(float[] buffer, int channels)
        {
            if (buffer == null || channels <= 0) return;
            lock (_gate)
            {
                if (_handle == IntPtr.Zero)
                {
                    Array.Clear(buffer, 0, buffer.Length);
                    return;
                }
                Native.chipforge_player_render(_handle, buffer, (UIntPtr)(buffer.Length / channels), (uint)channels);
            }
        }

        IntPtr Handle => _handle != IntPtr.Zero ? _handle : throw new ObjectDisposedException(nameof(ChipForgePlayer));

        public void Dispose()
        {
            lock (_gate)
            {
                if (_handle != IntPtr.Zero) Native.chipforge_player_free(_handle);
                _handle = IntPtr.Zero;
            }
            GC.SuppressFinalize(this);
        }

        ~ChipForgePlayer()
        {
            if (_handle != IntPtr.Zero) Native.chipforge_player_free(_handle);
        }
    }
}
