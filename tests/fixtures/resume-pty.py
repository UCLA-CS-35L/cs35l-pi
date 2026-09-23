"""Run the actual wrapper and native picker without any provider requests."""
import errno, fcntl, os, pty, re, select, shlex, signal, struct, subprocess, sys, tempfile, termios, time
from pathlib import Path

root = Path(sys.argv[2])
with tempfile.TemporaryDirectory(prefix="pi-resume-") as base:
    env = {**os.environ, "CS35L_STATE_DIR": base + "/state", "PI_OFFLINE": "1", "TERM": "xterm-256color"}
    subprocess.run([sys.argv[1], str(root / "tests/fixtures/resume-seed.mjs"), base], env=env, check=True)
    wrapper = Path(base) / "cs35l-pi"
    wrapper.write_text((root / "scripts/cs35l-pi.sh").read_text().replace("@CS35L_PI_ROOT@", shlex.quote(str(root))))
    wrapper.chmod(0o755)

    def exercise(empty=False, cancel=False):
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
        run_env = {**env, **({"CS35L_STATE_DIR": base + "/empty"} if empty else {})}
        proc = subprocess.Popen([str(wrapper), "resume"], cwd=base, env=run_env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        transcript = bytearray()
        def screen():
            return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", transcript.decode(errors="replace"))
        def wait_for(predicate, label):
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if predicate(): return
                if select.select([master], [], [], .1)[0]:
                    try: transcript.extend(os.read(master, 65536))
                    except OSError as e:
                        if e.errno != errno.EIO: raise
                        break
            raise AssertionError(label + "\n" + screen()[-6000:])
        try:
            wait_for(lambda: "Resume Session (All)" in screen(), "Not in all-session scope")
            if empty:
                wait_for(lambda: "No sessions found" in screen(), "No empty-state message")
                os.write(master, b"\x1b")
            elif cancel:
                wait_for(lambda: "Resume fixture alpha" in screen(), "Sessions not loaded")
                os.write(master, b"\x03")
            else:
                wait_for(lambda: "Resume fixture alpha" in screen() and "Resume fixture beta" in screen(), "Missing cross-workspace sessions")
                os.write(master, b"alpha")
                time.sleep(.3)
                os.write(master, b"\r")
                wait_for(lambda: "RESTORED_ALPHA_HISTORY" in screen(), "Selected history not restored")
                wait_for(lambda: base + "/alpha" in screen(), "Original workspace not shown")
                os.write(master, b"\x03")
                wait_for(lambda: "Press Ctrl+C again" in screen(), "Harness extension not active")
                os.write(master, b"\x03")
            assert proc.wait(timeout=10) == 0
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            os.close(master)
    exercise()
    exercise(cancel=True)
    exercise(empty=True)
    print("PTY verified: all sessions, search, resume history, workspace, harness, cancel, empty state")
