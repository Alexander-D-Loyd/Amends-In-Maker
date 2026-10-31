using System;
using System.ComponentModel;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

[assembly: AssemblyTitle("AiM")]
[assembly: AssemblyDescription("Portable AiM application launcher")]
[assembly: AssemblyProduct("AiM")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class Program
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int cb; public string reserved, desktop, title;
        public uint x, y, xSize, ySize, xCount, yCount, fill, flags;
        public ushort showWindow, reservedBytes; public IntPtr reservedData, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr process, thread; public uint processId, threadId; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorkingSet, maxWorkingSet; public uint activeProcesses;
        public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits basic; public IoCounters io;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObjectW(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")]
    private static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll")]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int kind);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr owner, string message, string title, uint type);

    // Quote each argument using Windows' backslash-before-quote rules. No shell is used.
    internal static string Quote(string value)
    {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1).Append(c);
            else result.Append('\\', slashes).Append(c);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    [STAThread]
    private static int Main(string[] args)
    {
        IntPtr job = IntPtr.Zero; ProcessInfo child = new ProcessInfo(); bool resumed = false;
        bool qa = Environment.GetEnvironmentVariable("AMENDS_IN_QA") == "1";
        try
        {
            string directory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Application Files");
            string application = Path.Combine(directory, "AiM.exe");
            if (!File.Exists(application)) throw new FileNotFoundException("Application Files is missing.");
            var command = new StringBuilder(Quote(application));
            foreach (string arg in args) command.Append(' ').Append(Quote(arg));
            if (command.Length >= 32767) throw new ArgumentException("The startup request is too long.");
            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new Win32Exception();
            var limits = new ExtendedLimits(); limits.basic.flags = 0x2000; // KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) throw new Win32Exception();
            var startup = new StartupInfo(); startup.cb = Marshal.SizeOf(typeof(StartupInfo));
            if (qa)
            {
                startup.flags = 0x100; startup.input = GetStdHandle(-10);
                startup.output = GetStdHandle(-11); startup.error = GetStdHandle(-12);
            }
            if (!CreateProcessW(application, command, IntPtr.Zero, IntPtr.Zero, qa, 4, IntPtr.Zero, directory, ref startup, out child)) throw new Win32Exception();
            if (!AssignProcessToJobObject(job, child.process)) throw new Win32Exception();
            if (ResumeThread(child.thread) == UInt32.MaxValue) throw new Win32Exception();
            resumed = true; CloseHandle(child.thread); child.thread = IntPtr.Zero;
            if (WaitForSingleObject(child.process, UInt32.MaxValue) != 0) throw new Win32Exception();
            uint code; if (!GetExitCodeProcess(child.process, out code)) throw new Win32Exception();
            return unchecked((int)code);
        }
        catch (Exception error)
        {
            string message = "AiM could not start. Extract the complete ZIP and keep the Application Files folder beside AiM.exe.";
            if (qa) Console.Error.WriteLine(message + " " + error.Message);
            else MessageBoxW(IntPtr.Zero, message, "AiM", 0x10);
            return 1;
        }
        finally
        {
            if (!resumed && child.process != IntPtr.Zero) TerminateProcess(child.process, 1);
            if (child.thread != IntPtr.Zero) CloseHandle(child.thread);
            if (child.process != IntPtr.Zero) CloseHandle(child.process);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }
}
