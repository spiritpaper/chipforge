// Checks ChipForgePlayer against the real native library.
//   ../test.sh   (builds libchipforge, then runs this)

using System;
using System.IO;
using System.Linq;
using System.Threading;
using ChipForge;

static class Program
{
    static int failures;

    static void Check(string label, bool ok, string detail = "")
    {
        Console.WriteLine($"  {(ok ? "✓" : "✗")} {label}{(detail != "" ? " — " + detail : "")}");
        if (!ok) failures++;
    }

    static double Rms(float[] x) => Math.Sqrt(x.Sum(v => (double)v * v) / x.Length);

    static int Main(string[] args)
    {
        byte[] song = File.ReadAllBytes(args[0]);
        const int rate = 48000;

        using (var p = new ChipForgePlayer(rate))
        {
            p.Load(song);
            Check("loads a song", p.SectionCount == 2, $"{p.SectionCount} sections");
            var buf = new float[4096 * 2];
            p.Render(buf, 2);
            Check("silent until played", Rms(buf) == 0);
            p.Play();
            p.Render(buf, 2);
            Check("plays in stereo", Rms(buf) > 0.05 && Enumerable.Range(0, 4096).All(i => buf[2 * i] == buf[2 * i + 1]), $"rms {Rms(buf):F3}");
            Check("reports position", p.IsPlaying && p.Section == 0);

            for (int ch = 0; ch < ChipForgePlayer.Channels; ch++) p.SetChannelMuted(ch, true);
            // The output filters let the last level fade over a few milliseconds (no click).
            p.Render(new float[rate / 10 * 2], 2);
            p.Render(buf, 2);
            Check("muting every channel silences it", Rms(buf) < 1e-4, $"rms {Rms(buf):G2}");
            for (int ch = 0; ch < ChipForgePlayer.Channels; ch++) p.SetChannelMuted(ch, false);

            // Play once: 2 patterns × 4 rows × 6 ticks at 60 ticks/s = 0.8 s.
            p.SetPlayOnce(true);
            p.Play();
            var mono = new float[(int)(0.85 * rate)];
            p.Render(mono, 1);
            Check("play-once finishes and stops", p.TakeFinished() && !p.IsPlaying);
            Check("finished is reported once", !p.TakeFinished());

            p.SetPlayOnce(false);
            p.SetTempoScale(2f);
            p.Play();
            p.Render(new float[(int)(0.21 * rate)], 1);
            Check("tempo scale speeds up", p.Section == 1, $"section {p.Section}");

            try
            {
                p.Load(new byte[] { 1, 2, 3, 4 });
                Check("bad data throws", false);
            }
            catch (ChipForgeException e)
            {
                Check("bad data throws a readable error", e.Code == -1 && e.Message.Contains("chipsong"), e.Message);
            }
            try
            {
                p.SetChannelMuted(9, true);
                Check("out-of-range channel throws", false);
            }
            catch (ArgumentOutOfRangeException)
            {
                Check("out-of-range channel throws", true);
            }

            // Control from one thread while another renders, as Unity does.
            p.SetTempoScale(1f);
            p.Play();
            var stop = false;
            var renderer = new Thread(() =>
            {
                var b = new float[512 * 2];
                while (!Volatile.Read(ref stop)) p.Render(b, 2);
            });
            renderer.Start();
            for (int i = 0; i < 2000; i++)
            {
                p.SetChannelMuted(i % 4, i % 3 == 0);
                p.QueueSection(i % 2);
                _ = p.Section;
            }
            Volatile.Write(ref stop, true);
            renderer.Join();
            Check("survives control from another thread while rendering", true);
        }

        var disposed = new ChipForgePlayer(rate);
        disposed.Dispose();
        try
        {
            disposed.Play();
            Check("using a disposed player throws", false);
        }
        catch (ObjectDisposedException)
        {
            Check("using a disposed player throws", true);
        }
        var silent = new float[64];
        silent[0] = 1;
        disposed.Render(silent, 1);
        Check("rendering a disposed player gives silence", silent.All(v => v == 0));

        Console.WriteLine(failures == 0 ? "All checks passed" : $"{failures} check(s) failed");
        return failures == 0 ? 0 : 1;
    }
}
