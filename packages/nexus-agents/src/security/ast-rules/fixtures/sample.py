"""Fixture for dangerous-eval-python / shell-injection-python ast-grep rules.

Each function below is intentionally tiny and self-contained: one rule-hit
per line keeps the red/green test assertions (ruleId + line number) stable
across edits. Generic sample data only (payload/user_input/cmd) — no
project- or vendor-specific names.
"""


def positive_eval(user_input):
    return eval(user_input)  # POSITIVE: dangerous-eval-python (eval)


def positive_exec(payload):
    exec(payload)  # POSITIVE: dangerous-eval-python (exec)


def positive_os_system(cmd):
    import os

    os.system(cmd)  # POSITIVE: shell-injection-python (os.system)


def positive_subprocess_shell_true(cmd):
    import subprocess

    subprocess.run(cmd, shell=True)  # POSITIVE: shell-injection-python (shell=True)


def negative_evaluate(x):
    return evaluate(x)  # NEGATIVE: not `eval` — must not match dangerous-eval-python


def negative_executor(y):
    return executor(y)  # NEGATIVE: not `exec` — must not match dangerous-eval-python


def negative_subprocess_no_shell(cmd):
    import subprocess

    return subprocess.run(cmd)  # NEGATIVE: no shell=True — must not match shell-injection-python
