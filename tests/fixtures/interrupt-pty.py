"""Exercise the real terminal input path, rather than calling abort directly."""
import errno
import fcntl
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

with tempfile.TemporaryDirectory(prefix="pi-interrupt-") as base:
    # macOS exposes temporary directories through /var and /private/var.
    base = os.path.realpath(base)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    process = subprocess.Popen(
        [sys.argv[1], sys.argv[2], base], stdin=slave, stdout=slave, stderr=slave,
        start_new_session=True, env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave)
    transcript = bytearray()

    def screen():
        text = transcript.decode("utf-8", errors="replace")
        return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)

    def wait_for(predicate, label, timeout=25):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            if select.select([master], [], [], 0.1)[0]:
                try:
                    transcript.extend(os.read(master, 65536))
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    time.sleep(0.01)
        raise AssertionError(label + "\n" + screen()[-6000:])

    try:
        wait_for(lambda: os.path.exists(base + "/ready"), "TUI did not start")
        os.write(master, b"Wait for cancellation\r")
        wait_for(lambda: os.path.exists(base + "/started"), "Model request did not start")
        os.write(master, b"\x03")
        wait_for(lambda: "Interrupt requested" in screen(), "No immediate indicator")
        wait_for(lambda: "Interrupted" in screen(), "No completion indicator")
        wait_for(lambda: os.path.exists(base + "/cancelled"), "Model connection was not cancelled")
        assert process.poll() is None, "Ctrl+C exited Pi"
        os.write(master, b"Respond normally now\r")
        wait_for(lambda: "READY_AFTER_INTERRUPT" in screen(), "Next prompt did not work")
        wait_for(lambda: os.path.exists(base + "/idle-2"), "Second turn did not finish")
        os.write(master, b"\x03")
        wait_for(lambda: "Press Ctrl+C again within 0.5 seconds to exit Pi." in screen(), "No exit hint")
        assert process.poll() is None, "First idle Ctrl+C exited Pi"
        os.write(master, b"\x03")
        # Keep draining terminal output while Pi restores the terminal on exit.
        wait_for(lambda: process.poll() is not None, "Pi did not exit", timeout=10)
        assert process.returncode == 0, process.returncode
        print("PTY verified: Ctrl+C indicators, cancelled model connection, subsequent prompt, idle exit hint, double-Ctrl+C exit.")
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        os.close(master)
