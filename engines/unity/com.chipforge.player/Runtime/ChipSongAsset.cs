using UnityEngine;

namespace ChipForge
{
    /// <summary>A .chipsong file imported into Unity (see ChipSongImporter).</summary>
    public class ChipSongAsset : ScriptableObject
    {
        [HideInInspector] public byte[] data;
        public int sectionCount;
        public int bpm;
    }
}
