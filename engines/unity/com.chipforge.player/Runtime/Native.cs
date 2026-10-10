// P/Invoke declarations for chipforge.h (engines/../native/include/chipforge.h).
// Blittable arrays (byte[], float[]) are pinned for the duration of each call.

using System;
using System.Runtime.InteropServices;

namespace ChipForge
{
    internal static class Native
    {
#if UNITY_IOS && !UNITY_EDITOR
        const string Lib = "__Internal";
#else
        const string Lib = "chipforge";
#endif

        [DllImport(Lib)] internal static extern uint chipforge_api_version();
        [DllImport(Lib)] internal static extern IntPtr chipforge_error_message(int code);
        [DllImport(Lib)] internal static extern IntPtr chipforge_player_new(float sampleRate);
        [DllImport(Lib)] internal static extern void chipforge_player_free(IntPtr player);
        [DllImport(Lib)] internal static extern int chipforge_player_load(IntPtr player, byte[] data, UIntPtr len);
        [DllImport(Lib)] internal static extern void chipforge_player_play(IntPtr player, uint order, uint row);
        [DllImport(Lib)] internal static extern void chipforge_player_stop(IntPtr player);
        [DllImport(Lib)] internal static extern int chipforge_player_is_playing(IntPtr player);
        [DllImport(Lib)] internal static extern int chipforge_player_order(IntPtr player);
        [DllImport(Lib)] internal static extern int chipforge_player_row(IntPtr player);
        [DllImport(Lib)] internal static extern uint chipforge_player_order_count(IntPtr player);
        [DllImport(Lib)] internal static extern uint chipforge_player_loops(IntPtr player);
        [DllImport(Lib)] internal static extern void chipforge_player_queue_order(IntPtr player, uint order);
        [DllImport(Lib)] internal static extern void chipforge_player_set_muted(IntPtr player, uint channel, int muted);
        [DllImport(Lib)] internal static extern void chipforge_player_set_tempo_scale(IntPtr player, float scale);
        [DllImport(Lib)] internal static extern void chipforge_player_set_volume(IntPtr player, float volume);
        [DllImport(Lib)] internal static extern void chipforge_player_set_play_once(IntPtr player, int on);
        [DllImport(Lib)] internal static extern int chipforge_player_take_finished(IntPtr player);
        [DllImport(Lib)] internal static extern void chipforge_player_render(IntPtr player, float[] output, UIntPtr frames, uint channels);
    }
}
