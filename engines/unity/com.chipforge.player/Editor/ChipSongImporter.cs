// Imports .chipsong files (Compose → Export → Game engine file) as ChipSongAssets.

using System.IO;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace ChipForge.Editor
{
    [ScriptedImporter(1, "chipsong")]
    public class ChipSongImporter : ScriptedImporter
    {
        public override void OnImportAsset(AssetImportContext ctx)
        {
            var asset = ScriptableObject.CreateInstance<ChipSongAsset>();
            asset.data = File.ReadAllBytes(ctx.assetPath);
            // Header: "CFS" version, u16 bpm at 4, u16 order length at 12 (little endian).
            if (asset.data.Length >= 18 && asset.data[0] == 'C' && asset.data[1] == 'F' && asset.data[2] == 'S')
            {
                asset.bpm = asset.data[4] | (asset.data[5] << 8);
                asset.sectionCount = asset.data[12] | (asset.data[13] << 8);
            }
            else
            {
                ctx.LogImportError($"{ctx.assetPath} is not a ChipForge song.");
            }
            ctx.AddObjectToAsset("song", asset);
            ctx.SetMainObject(asset);
        }
    }
}
