using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.Win32;

internal static class Program
{
    private const uint COINIT_APARTMENTTHREADED = 0x2;

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(IntPtr pvReserved, uint dwCoInit);

    [DllImport("ole32.dll")]
    private static extern void CoUninitialize();

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

    [ComImport]
    [Guid("33C53A50-F456-4884-B049-85FD643ECFED")]
    private class TF_InputProcessorProfiles
    {
    }

    [ComImport]
    [Guid("71C6E74C-0F28-11D8-A82A-00065B84435C")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITfInputProcessorProfileMgr
    {
        int ActivateProfile(uint dwProfileType, ushort langid, ref Guid clsid, ref Guid guidProfile, IntPtr hkl, uint dwFlags);
        int DeactivateProfile(uint dwProfileType, ushort langid, ref Guid clsid, ref Guid guidProfile, IntPtr hkl, uint dwFlags);
        int GetProfile(uint dwProfileType, ushort langid, ref Guid clsid, ref Guid guidProfile, IntPtr hkl, out TF_INPUTPROCESSORPROFILE profile);
        int EnumProfiles(ushort langid, out IntPtr enumProfiles);
        int GetActiveProfile(ref Guid catid, out TF_INPUTPROCESSORPROFILE profile);
    }

    [ComImport]
    [Guid("1F02B6C5-7842-4EE6-8A0B-9A24183A95CA")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITfInputProcessorProfiles
    {
        [PreserveSig] int Register(ref Guid rclsid);
        [PreserveSig] int Unregister(ref Guid rclsid);
        [PreserveSig] int AddLanguageProfile(ref Guid rclsid, ushort langid, ref Guid guidProfile, [MarshalAs(UnmanagedType.LPWStr)] string pchDesc, uint cchDesc, [MarshalAs(UnmanagedType.LPWStr)] string pchIconFile, uint cchFile, uint uIconIndex);
        [PreserveSig] int RemoveLanguageProfile(ref Guid rclsid, ushort langid, ref Guid guidProfile);
        [PreserveSig] int EnumInputProcessorInfo(out IntPtr ppEnum);
        [PreserveSig] int GetDefaultLanguageProfile(ushort langid, ref Guid catid, out Guid pclsid, out Guid pguidProfile);
        [PreserveSig] int SetDefaultLanguageProfile(ushort langid, ref Guid rclsid, ref Guid guidProfiles);
        [PreserveSig] int ActivateLanguageProfile(ref Guid rclsid, ushort langid, ref Guid guidProfiles);
        [PreserveSig] int GetActiveLanguageProfile(ref Guid rclsid, out ushort plangid, out Guid pguidProfile);
        [PreserveSig] int GetLanguageProfileDescription(ref Guid rclsid, ushort langid, ref Guid guidProfile, [MarshalAs(UnmanagedType.BStr)] out string pbstrProfile);
        [PreserveSig] int GetCurrentLanguage(out ushort plangid);
        [PreserveSig] int ChangeCurrentLanguage(ushort langid);
        [PreserveSig] int GetLanguageList(out IntPtr ppLangId, out uint pulCount);
        [PreserveSig] int EnumLanguageProfiles(ushort langid, out IEnumTfLanguageProfiles ppEnum);
        [PreserveSig] int EnableLanguageProfile(ref Guid rclsid, ushort langid, ref Guid guidProfile, [MarshalAs(UnmanagedType.Bool)] bool fEnable);
        [PreserveSig] int IsEnabledLanguageProfile(ref Guid rclsid, ushort langid, ref Guid guidProfile, [MarshalAs(UnmanagedType.Bool)] out bool pfEnable);
        [PreserveSig] int EnableLanguageProfileByDefault(ref Guid rclsid, ushort langid, ref Guid guidProfile, [MarshalAs(UnmanagedType.Bool)] bool fEnable);
        [PreserveSig] int SubstituteKeyboardLayout(ref Guid rclsid, ushort langid, ref Guid guidProfile, IntPtr hkl);
    }

    [ComImport]
    [Guid("3D61BF11-AC5F-42C8-A4CB-931BCC28C744")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IEnumTfLanguageProfiles
    {
        [PreserveSig] int Clone(out IEnumTfLanguageProfiles ppEnum);
        [PreserveSig] int Next(uint ulCount, [Out] TF_LANGUAGEPROFILE[] pProfile, out uint pcFetch);
        [PreserveSig] int Reset();
        [PreserveSig] int Skip(uint ulCount);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TF_INPUTPROCESSORPROFILE
    {
        public uint dwProfileType;
        public ushort langid;
        public Guid clsid;
        public Guid guidProfile;
        public Guid catid;
        public IntPtr hkl;
        public uint dwCaps;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TF_LANGUAGEPROFILE
    {
        public Guid clsid;
        public ushort langid;
        public Guid catid;
        public int fActive;
        public Guid guidProfile;
    }

    private static readonly Guid GUID_TFCAT_TIP_KEYBOARD = new("34745C63-B2F0-4784-8B67-5E12C8701A31");

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

    private static (bool Open, string Name, string Klid, string ProfileId, string Variant) GetImeStatus()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero)
        {
            return (false, "Unknown", "00000000", "", "");
        }

        var fgThreadId = GetWindowThreadProcessId(hwnd, out _);
        var focusHwnd = GetFocusedWindowHandle(fgThreadId, hwnd);
        var focusThreadId = GetWindowThreadProcessId(focusHwnd, out _);
        var hkl = GetKeyboardLayout(focusThreadId);
        var hklValue = (ulong)hkl.ToInt64();
        var klid = (hklValue & 0xffffffff).ToString("X8");
        var langidFromHkl = (ushort)(hklValue & 0xffff);

        var imeNameFromHkl = GetImeName(hkl);
        var imeFile = GetImeFileName(hkl);
        var variant = DetectVariant($"{imeNameFromHkl} {imeFile}");
        var imeName = imeNameFromHkl;
        var tsfProfile = "";
        string? tsfName = null;
        if (TryGetActiveTsfLanguageProfile(langidFromHkl, out _, out var activeName, out var activeProfileId))
        {
            tsfProfile = activeProfileId;
            tsfName = activeName;
        }
        else
        {
            tsfName = GetTsfProfileNameLegacy(out tsfProfile);
        }
        if (!string.IsNullOrWhiteSpace(tsfName))
        {
            var tsfVariant = DetectVariant(tsfName!);
            if (!string.IsNullOrWhiteSpace(tsfVariant))
            {
                variant = tsfVariant;
                imeName = tsfName!;
            }
            else if (string.IsNullOrWhiteSpace(variant))
            {
                imeName = tsfName!;
            }
        }

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

        return (open, imeName, klid, tsfProfile, variant);
    }

    private static string DetectVariant(string source)
    {
        if (string.IsNullOrWhiteSpace(source)) return "";
        var upper = source.ToUpperInvariant();
        if (upper.Contains("WUBI") || upper.Contains("MSWB")) return "wubi";
        if (upper.Contains("PINYIN") || upper.Contains("MSPY") || upper.Contains("MSPIME") || upper.Contains("MSCTFIME") || upper.Contains("CHSIME")) return "pinyin";
        return "";
    }

    private static string? GetTsfProfileNameLegacy(out string profileId)
    {
        profileId = "";
        try
        {
            var mgr = (ITfInputProcessorProfileMgr)new TF_InputProcessorProfiles();
            var cat = GUID_TFCAT_TIP_KEYBOARD;
            var hr = mgr.GetActiveProfile(ref cat, out var profile);
            if (hr != 0) return null;
            profileId = profile.guidProfile.ToString("B").ToUpperInvariant();
            var desc = ReadTsfProfileDescription(profile.clsid, profile.langid, profile.guidProfile);
            return string.IsNullOrWhiteSpace(desc) ? null : desc;
        }
        catch
        {
            return null;
        }
    }

    private static bool TryGetActiveTsfLanguageProfile(ushort langidHint, out TF_LANGUAGEPROFILE profile, out string? profileName, out string profileId)
    {
        profile = default;
        profileName = null;
        profileId = "";
        try
        {
            var profiles = (ITfInputProcessorProfiles)new TF_InputProcessorProfiles();
            var langid = langidHint;
            if (langid == 0)
            {
                if (profiles.GetCurrentLanguage(out langid) != 0)
                {
                    return false;
                }
            }

            if (profiles.EnumLanguageProfiles(langid, out var enumProfiles) != 0 || enumProfiles == null)
            {
                return false;
            }

            var fetched = 0u;
            var buffer = new TF_LANGUAGEPROFILE[1];
            while (enumProfiles.Next(1, buffer, out fetched) == 0 && fetched == 1)
            {
                var item = buffer[0];
                if (item.catid == GUID_TFCAT_TIP_KEYBOARD && item.fActive != 0)
                {
                    profile = item;
                    profileId = item.guidProfile.ToString("B").ToUpperInvariant();
                    if (profiles.GetLanguageProfileDescription(ref item.clsid, item.langid, ref item.guidProfile, out var desc) == 0)
                    {
                        profileName = desc;
                    }
                    if (string.IsNullOrWhiteSpace(profileName))
                    {
                        profileName = ReadTsfProfileDescription(item.clsid, item.langid, item.guidProfile);
                    }
                    return true;
                }
            }

            // Fallback: ask each input processor for its active profile
            if (profiles.EnumInputProcessorInfo(out var enumPtr) == 0 && enumPtr != IntPtr.Zero)
            {
                try
                {
                    var enumGuid = (System.Runtime.InteropServices.ComTypes.IEnumGUID)Marshal.GetObjectForIUnknown(enumPtr);
                    var clsidBuf = new Guid[1];
                    var fetchedGuid = new int[1];
                    while (enumGuid.Next(1, clsidBuf, fetchedGuid) == 0 && fetchedGuid[0] == 1)
                    {
                        var clsid = clsidBuf[0];
                        if (profiles.GetActiveLanguageProfile(ref clsid, out var activeLangid, out var guidProfile) == 0 && guidProfile != Guid.Empty)
                        {
                            profile = new TF_LANGUAGEPROFILE
                            {
                                clsid = clsid,
                                langid = activeLangid,
                                catid = GUID_TFCAT_TIP_KEYBOARD,
                                fActive = 1,
                                guidProfile = guidProfile
                            };
                            profileId = guidProfile.ToString("B").ToUpperInvariant();
                            if (profiles.GetLanguageProfileDescription(ref clsid, activeLangid, ref guidProfile, out var desc) == 0)
                            {
                                profileName = desc;
                            }
                            if (string.IsNullOrWhiteSpace(profileName))
                            {
                                profileName = ReadTsfProfileDescription(clsid, activeLangid, guidProfile);
                            }
                            return true;
                        }
                    }
                }
                finally
                {
                    Marshal.Release(enumPtr);
                }
            }
        }
        catch
        {
            // Ignore TSF failures and fall back to legacy path.
        }

        return false;
    }

    private static string? ReadTsfProfileDescription(Guid clsid, ushort langid, Guid profile)
    {
        var clsidStr = clsid.ToString("B").ToUpperInvariant();
        var profileStr = profile.ToString("B").ToUpperInvariant();
        var langStr = langid.ToString("X4");
        var path = $@"SOFTWARE\Microsoft\CTF\TIP\{clsidStr}\LanguageProfile\0x{langStr}\{profileStr}";

        var name = ReadRegistryValue(Registry.LocalMachine, path, "Description")
                   ?? ReadRegistryValue(Registry.CurrentUser, path, "Description");
        return name;
    }

    private static string? ReadRegistryValue(RegistryKey root, string subKey, string valueName)
    {
        using var key = root.OpenSubKey(subKey);
        return key?.GetValue(valueName) as string;
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
        if (upper.Contains("MSCTFIME")) return "Microsoft Pinyin";
        if (upper.Contains("MSPY")) return "Microsoft Pinyin";
        if (upper.Contains("MSPIME")) return "Microsoft Pinyin";
        if (upper.Contains("PINTLGNT")) return "Microsoft Pinyin";
        if (upper.Contains("MSWB")) return "Microsoft Wubi";
        if (upper.Contains("WUBI")) return "Microsoft Wubi";
        if (upper.Contains("CHSIME")) return "Microsoft Pinyin";
        if (upper.Contains("CHT")) return "Microsoft Zhuyin";
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
        if (upper == "E0010804") return "Microsoft Pinyin";
        if (upper == "E0020804") return "Microsoft Wubi";
        if (upper == "E0030804") return "Microsoft Pinyin";
        if (upper == "E0040804") return "Microsoft Pinyin";
        if (upper == "E0050804") return "Microsoft Wubi";

        // Low word layout IDs
        if (upper == "00000804") return "Chinese (Simplified) - US Keyboard";
        if (upper == "00000409") return "English (US)";

        return "";
    }

    private static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        CoInitializeEx(IntPtr.Zero, COINIT_APARTMENTTHREADED);

        var lastOpen = false;
        var lastName = "";
        var lastKlid = "";
        var lastProfile = "";
        var lastVariant = "";

        while (true)
        {
            try
            {
                var status = GetImeStatus();
                if (status.Open != lastOpen || status.Name != lastName || status.Klid != lastKlid || status.ProfileId != lastProfile || status.Variant != lastVariant)
                {
                    lastOpen = status.Open;
                    lastName = status.Name;
                    lastKlid = status.Klid;
                    lastProfile = status.ProfileId;
                    lastVariant = status.Variant;
                    var payload = new
                    {
                        open = status.Open,
                        name = status.Name,
                        klid = status.Klid,
                        profile = status.ProfileId,
                        variant = status.Variant,
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

        // ReSharper disable once FunctionNeverReturns
        CoUninitialize();
    }
}

