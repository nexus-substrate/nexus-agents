#!/usr/bin/env python3
"""
swe-bench-pro-run.py — Generate predictions for SWE-bench Pro using Claude CLI.

Loads ScaleAI/SWE-bench_Pro dataset, creates a workspace per instance,
runs Claude with the problem + requirements + interface context, and
outputs predictions in Pro format.

Usage:
  python scripts/swe-bench-pro-run.py --limit 10
  python scripts/swe-bench-pro-run.py --limit 10 --dry-run
"""

import argparse
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

def load_pro_dataset(limit=None):
    """Load SWE-bench Pro dataset from HuggingFace."""
    from datasets import load_dataset
    ds = load_dataset('ScaleAI/SWE-bench_Pro', split='test')
    instances = list(ds)
    if limit:
        instances = instances[:limit]
    return instances

def build_prompt(instance):
    """Build a prompt for the Pro instance including requirements and interface."""
    parts = [
        f"## Repository: {instance['repo']}",
        f"## Language: {instance['repo_language']}",
        f"## Instance: {instance['instance_id']}",
        "",
        "## Problem Statement",
        instance['problem_statement'],
    ]

    if instance.get('requirements'):
        parts.extend(["", "## Requirements", instance['requirements']])

    if instance.get('interface'):
        parts.extend(["", "## Interface Specification", instance['interface']])

    if instance.get('fail_to_pass'):
        parts.extend([
            "", "## Tests That Must Pass After Fix (CRITICAL)",
            instance['fail_to_pass'],
        ])

    parts.extend([
        "", "---",
        "Analyze the issue and provide a git diff patch.",
        "Output the patch in ```diff ... ``` format.",
    ])

    return "\n".join(parts)

SYSTEM_PROMPT = """You are an expert software engineer solving GitHub issues.
Fix the issue with a minimal patch. Change as few lines as possible.

Guidelines:
1. Read the problem statement, requirements, and interface specification carefully.
2. Read the FAIL_TO_PASS tests to understand expected behavior.
3. Find the root cause and fix it with minimal changes.
4. Output the patch using: ```diff\n[git diff output]\n```"""

def run_agent(instance, workspace, dry_run=False):
    """Run Claude CLI on a Pro instance."""
    prompt = build_prompt(instance)

    if dry_run:
        return {"instance_id": instance['instance_id'], "patch": "", "prefix": ""}

    # Clone repo
    repo = instance['repo']
    base_commit = instance['base_commit']

    clone_dir = os.path.join(workspace, repo.replace('/', '__'))
    if not os.path.exists(clone_dir):
        result = subprocess.run(
            ['git', 'clone', '--depth=50', f'https://github.com/{repo}.git', clone_dir],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            print(f"  Failed to clone {repo}")
            return None

    # Checkout base commit
    subprocess.run(['git', 'checkout', base_commit], cwd=clone_dir, capture_output=True, timeout=30)

    # Run Claude
    try:
        result = subprocess.run(
            ['claude', '-p', '--output-format', 'json', '--model', 'sonnet',
             '--system-prompt', SYSTEM_PROMPT,
             '--add-dir', clone_dir,
             '--dangerously-skip-permissions'],
            input=prompt,
            capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            print(f"  Claude failed: {result.stderr[:100]}")
            return None

        # Extract patch from response
        response = result.stdout
        try:
            data = json.loads(response)
            text = data.get('result', '')
        except json.JSONDecodeError:
            text = response

        # Extract diff block
        import re
        diff_match = re.search(r'```diff\n([\s\S]*?)```', text)
        if diff_match:
            patch = diff_match.group(1).strip()
        else:
            raw_match = re.search(r'(diff --git[\s\S]*?)(?:\n\n[^d]|$)', text)
            patch = raw_match.group(1).strip() if raw_match else ""

        return {
            "instance_id": instance['instance_id'],
            "patch": patch,
            "prefix": "",
        }

    except subprocess.TimeoutExpired:
        print(f"  Timeout")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--output', default='artifacts/swe-bench-pro-predictions.json')
    args = parser.parse_args()

    print(f"SWE-bench Pro Run")
    print(f"Limit: {args.limit}, Dry run: {args.dry_run}")

    instances = load_pro_dataset(args.limit)
    print(f"Loaded {len(instances)} instances")

    workspace = tempfile.mkdtemp(prefix='swe-bench-pro-')
    predictions = []

    for i, instance in enumerate(instances):
        print(f"\n[{i+1}/{len(instances)}] {instance['instance_id'][:60]}")
        print(f"  Repo: {instance['repo']}, Language: {instance['repo_language']}")

        result = run_agent(instance, workspace, args.dry_run)
        if result:
            predictions.append(result)
            print(f"  Patch: {len(result['patch'])} chars")
        else:
            print(f"  FAILED")

        if not args.dry_run:
            time.sleep(1)  # Rate limit

    # Write predictions
    output_path = args.output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(predictions, f, indent=2)

    print(f"\nPredictions: {len(predictions)}/{len(instances)}")
    print(f"Written to: {output_path}")

if __name__ == '__main__':
    main()
