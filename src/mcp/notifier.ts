import { execFile } from "child_process";
import { platform } from "os";

const noop = () => {};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function notifyDesktop(title: string, message: string): void {
  try {
    const os = platform();
    if (os === "darwin") {
      // `tell application "Finder"` is required: bare `display notification` silently
      // fails on macOS Tahoe (26+) when called from a non-app process context.
      execFile("osascript", [
        "-e",
        `tell application "Finder" to display notification "${esc(message)}" with title "${esc(title)}"`,
      ], noop);
    } else if (os === "linux") {
      execFile("notify-send", [title, message], noop);
    } else if (os === "win32") {
      // Title and message are placed inside PowerShell single-quoted strings.
      // Single-quoted PS strings are literal — backticks and $() are not interpreted,
      // so only ' needs escaping (→ '').
      const t = title.replace(/'/g, "''");
      const m = message.replace(/'/g, "''");
      execFile("powershell", [
        "-Command",
        `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;$t=[Windows.UI.Notifications.ToastTemplateType]::ToastText02;$x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($t);$x.GetElementsByTagName('text')[0].AppendChild($x.CreateTextNode('${t}'))|Out-Null;$x.GetElementsByTagName('text')[1].AppendChild($x.CreateTextNode('${m}'))|Out-Null;[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('agents-mesh').Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
      ], noop);
    }
  } catch {}
}
