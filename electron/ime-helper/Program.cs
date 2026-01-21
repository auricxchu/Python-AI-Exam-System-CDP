using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.Win32;

internal static class Program
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern IntPtr GetKeyboardLayout(uint idThread);

    [DllImport("imm32.dll")]
    private static extern IntPtr ImmGetContext(IntPtr hWnd);

    [DllImport("imm32.dll")]
    private static extern bool ImmGetOpenStatus(IntPtr hIMC);

    [DllImport("imm32.dll")]
    private static extern bool ImmGetConversionStatus(IntPtr hIMC, out uint lpfdwConversion, out uint lpfdwSentence);

    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);

    [DllImport("imm32.dll", CharSet = CharSet.Unicode)]
    private static extern int ImmGetDescription(IntPtr hKL, StringBuilder lpszDescription, int uBufLen);

    [DllImport("imm32.dll", CharSet = CharSet.Unicode)]
    private static extern uint ImmGetIMEFileName(IntPtr hKL, StringBuilder lpszFileName, uint uBufLen);

    [DllImport("imm32.dll")]
    private static extern bool ImmReleaseContext(IntPtr hWnd, IntPtr hIMC);

    [StructLayout(LayoutKind.Sequential)]
    private struct GUITHREADINFO
    {
        public int cbSize;
        public int flags;
        public IntPtr hwndActive;
        public IntPtr hwndFocus;
        public IntPtr hwndCapture;
        public IntPtr hwndMenuOwner;
        public IntPtr hwndMoveSize;
        public IntPtr hwndCaret;
        public RECT rcCaret;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int left;
        public int top;
        public int right;
        public int bottom;
    }

    private static IntPtr GetFocusedWindowHandle(uint threadId, IntPtr fallback)
    {
        var info = new GUITHREADINFO { cbSize = Marshal.SizeOf<GUITHREADINFO>() };
        if (GetGUIThreadInfo(threadId, ref info))
        {
            if (info.hwndFocus != IntPtr.Zero) return info.hwndFocus;
            if (info.hwndActive != IntPtr.Zero) return info.hwndActive;
        }
        return fallback;
    }

    private static (bool Open, string Name, string Klid) GetImeStatus()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero)
        {
            return (false, "Unknown", "00000000");
        }

        var fgThreadId = GetWindowThreadProcessId(hwnd, out _);
        var focusHwnd = GetFocusedWindowHandle(fgThreadId, hwnd);
        var focusThreadId = GetWindowThreadProcessId(focusHwnd, out _);
        var hkl = GetKeyboardLayout(focusThreadId);
        var hklValue = (ulong)hkl.ToInt64();
        var klid = (hklValue & 0xffffffff).ToString("X8");

        var imeName = GetImeName(hkl);

        var hImc = ImmGetContext(focusHwnd);
        var open = false;
        if (hImc != IntPtr.Zero)
        {
            open = ImmGetOpenStatus(hImc);
            if (ImmGetConversionStatus(hImc, out var conversion, out _))
            {
                const uint IME_CMODE_NATIVE = 0x0001;
                // Prefer conversion mode for CN/EN state.
                open = (conversion & IME_CMODE_NATIVE) != 0;
            }
            ImmReleaseContext(focusHwnd, hImc);
        }
        else
        {
            // Fallback: if IME context is unavailable, infer from layout
            open = klid.EndsWith("0804", StringComparison.OrdinalIgnoreCase);
        }

        return (open, imeName, klid);
    }

    private static string GetImeName(IntPtr hkl)
    {
        var desc = GetImeDescription(hkl);
        if (!string.IsNullOrWhiteSpace(desc) && desc != "Unknown")
        {
            return desc;
        }

        var fileName = GetImeFileName(hkl);
        if (!string.IsNullOrWhiteSpace(fileName))
        {
            var mapped = MapImeFileName(fileName);
            if (!string.IsNullOrWhiteSpace(mapped))
            {
                return mapped;
            }
        }

        return GetLayoutNameFromRegistry(hkl);
    }

    private static string GetImeDescription(IntPtr hkl)
    {
        var nameBuilder = new StringBuilder(256);
        var nameLen = ImmGetDescription(hkl, nameBuilder, nameBuilder.Capacity);
        return nameLen > 0 ? nameBuilder.ToString() : "Unknown";
    }

    private static string GetImeFileName(IntPtr hkl)
    {
        var buf = new StringBuilder(260);
        var len = ImmGetIMEFileName(hkl, buf, (uint)buf.Capacity);
        return len > 0 ? buf.ToString() : "";
    }

    private static string MapImeFileName(string fileName)
    {
        var upper = fileName.ToUpperInvariant();
        if (upper.Contains("MSCTFIME")) return "微软拼音";
        if (upper.Contains("MSPY")) return "微软拼音";
        if (upper.Contains("MSPIME")) return "微软拼音";
        if (upper.Contains("PINTLGNT")) return "微软拼音";
        if (upper.Contains("MSWB")) return "微软五笔";
        if (upper.Contains("WUBI")) return "微软五笔";
        if (upper.Contains("CHSIME")) return "微软拼音";
        if (upper.Contains("CHT")) return "微软注音";
        return "";
    }

    private static string GetLayoutNameFromRegistry(IntPtr hkl)
    {
        try
        {
            var hklValue = (ulong)hkl.ToInt64();
            var fullKlid = (hklValue & 0xffffffff).ToString("X8");
            var lowKlid = ((uint)hklValue & 0xffff).ToString("X4").PadLeft(8, '0');

            var mapped = MapLayoutId(fullKlid);
            if (!string.IsNullOrWhiteSpace(mapped))
            {
                return mapped;
            }

            var name = ReadLayoutText(fullKlid) ?? ReadLayoutText(lowKlid);
            if (!string.IsNullOrWhiteSpace(name))
            {
                return name!;
            }

            return "Unknown";
        }
        catch
        {
            return "Unknown";
        }
    }

    private static string? ReadLayoutText(string klid)
    {
        using var key = Registry.LocalMachine.OpenSubKey($@"SYSTEM\CurrentControlSet\Control\Keyboard Layouts\{klid}");
        var name = key?.GetValue("Layout Text") as string;
        if (!string.IsNullOrWhiteSpace(name))
        {
            return name;
        }

        var imeFile = key?.GetValue("Ime File") as string;
        var mapped = MapImeFileName(imeFile ?? "");
        return string.IsNullOrWhiteSpace(mapped) ? null : mapped;
    }

    private static string MapLayoutId(string klid)
    {
        var upper = klid.ToUpperInvariant();

        // Full IME HKL IDs (common on Windows 10/11)
        if (upper == "E0010804") return "微软拼音";
        if (upper == "E0020804") return "微软五笔";
        if (upper == "E0030804") return "微软拼音";
        if (upper == "E0040804") return "微软拼音";
        if (upper == "E0050804") return "微软五笔";

        // Low word layout IDs
        if (upper == "00000804") return "中文输入法";
        if (upper == "00000409") return "英文(美式键盘)";

        return "";
    }

    private static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;

        var lastOpen = false;
        var lastName = "";

        while (true)
        {
            try
            {
                var status = GetImeStatus();
                if (status.Open != lastOpen || status.Name != lastName)
                {
                    lastOpen = status.Open;
                    lastName = status.Name;
                    var payload = new
                    {
                        open = status.Open,
                        name = status.Name,
                        klid = status.Klid,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    };
                    Console.WriteLine(JsonSerializer.Serialize(payload));
                }
            }
            catch
            {
                // Ignore transient errors and keep running.
            }

            Thread.Sleep(200);
        }
    }
}
