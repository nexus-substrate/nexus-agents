#!/bin/bash
# Claude Configuration Cleanup Script
# Safely removes old debug logs, session history, and file-history
#
# Usage:
#   ./claude-cleanup.sh           # Dry run (shows what would be deleted)
#   ./claude-cleanup.sh --execute # Actually delete files
#
# Recommended: Run monthly via cron or manually

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
DRY_RUN=true

# Parse arguments
if [[ "${1:-}" == "--execute" ]]; then
    DRY_RUN=false
fi

echo "Claude Configuration Cleanup"
echo "============================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to format bytes
format_size() {
    local size=$1
    if (( size >= 1073741824 )); then
        echo "$(echo "scale=1; $size / 1073741824" | bc)G"
    elif (( size >= 1048576 )); then
        echo "$(echo "scale=1; $size / 1048576" | bc)M"
    elif (( size >= 1024 )); then
        echo "$(echo "scale=1; $size / 1024" | bc)K"
    else
        echo "${size}B"
    fi
}

# Current sizes
echo "Current sizes:"
du -sh "${CLAUDE_DIR}/projects" "${CLAUDE_DIR}/debug" "${CLAUDE_DIR}/file-history" 2>/dev/null || true
echo ""

# Debug logs older than 7 days
DEBUG_DIR="${CLAUDE_DIR}/debug"
if [[ -d "$DEBUG_DIR" ]]; then
    DEBUG_FILES=$(find "$DEBUG_DIR" -type f -mtime +7 2>/dev/null | wc -l)
    DEBUG_SIZE=$(find "$DEBUG_DIR" -type f -mtime +7 -exec du -cb {} + 2>/dev/null | tail -1 | cut -f1 || echo 0)

    echo -e "${YELLOW}Debug logs (>7 days):${NC}"
    echo "  Files to remove: $DEBUG_FILES"
    echo "  Space to free: $(format_size ${DEBUG_SIZE:-0})"

    if [[ "$DRY_RUN" == false ]] && [[ "$DEBUG_FILES" -gt 0 ]]; then
        find "$DEBUG_DIR" -type f -mtime +7 -delete
        echo -e "  ${GREEN}Deleted.${NC}"
    fi
fi

echo ""

# File history older than 30 days
HISTORY_DIR="${CLAUDE_DIR}/file-history"
if [[ -d "$HISTORY_DIR" ]]; then
    HISTORY_FILES=$(find "$HISTORY_DIR" -type f -mtime +30 2>/dev/null | wc -l)
    HISTORY_SIZE=$(find "$HISTORY_DIR" -type f -mtime +30 -exec du -cb {} + 2>/dev/null | tail -1 | cut -f1 || echo 0)

    echo -e "${YELLOW}File history (>30 days):${NC}"
    echo "  Files to remove: $HISTORY_FILES"
    echo "  Space to free: $(format_size ${HISTORY_SIZE:-0})"

    if [[ "$DRY_RUN" == false ]] && [[ "$HISTORY_FILES" -gt 0 ]]; then
        find "$HISTORY_DIR" -type f -mtime +30 -delete
        echo -e "  ${GREEN}Deleted.${NC}"
    fi
fi

echo ""

# Session history older than 90 days (more conservative)
PROJECTS_DIR="${CLAUDE_DIR}/projects"
if [[ -d "$PROJECTS_DIR" ]]; then
    PROJECT_FILES=$(find "$PROJECTS_DIR" -type f -mtime +90 2>/dev/null | wc -l)
    PROJECT_SIZE=$(find "$PROJECTS_DIR" -type f -mtime +90 -exec du -cb {} + 2>/dev/null | tail -1 | cut -f1 || echo 0)

    echo -e "${YELLOW}Session history (>90 days):${NC}"
    echo "  Files to remove: $PROJECT_FILES"
    echo "  Space to free: $(format_size ${PROJECT_SIZE:-0})"

    if [[ "$DRY_RUN" == false ]] && [[ "$PROJECT_FILES" -gt 0 ]]; then
        find "$PROJECTS_DIR" -type f -mtime +90 -delete
        # Clean up empty directories
        find "$PROJECTS_DIR" -type d -empty -delete 2>/dev/null || true
        echo -e "  ${GREEN}Deleted.${NC}"
    fi
fi

echo ""

# Broken symlinks in skills/agents
SKILLS_DIR="${CLAUDE_DIR}/skills"
AGENTS_DIR="${CLAUDE_DIR}/agents"
BROKEN_LINKS=0

if [[ -d "$SKILLS_DIR" ]]; then
    BROKEN_SKILLS=$(find "$SKILLS_DIR" -type l ! -exec test -e {} \; -print 2>/dev/null | wc -l)
    BROKEN_LINKS=$((BROKEN_LINKS + BROKEN_SKILLS))
fi

if [[ -d "$AGENTS_DIR" ]]; then
    BROKEN_AGENTS=$(find "$AGENTS_DIR" -type l ! -exec test -e {} \; -print 2>/dev/null | wc -l)
    BROKEN_LINKS=$((BROKEN_LINKS + BROKEN_AGENTS))
fi

if [[ "$BROKEN_LINKS" -gt 0 ]]; then
    echo -e "${RED}Broken symlinks found: $BROKEN_LINKS${NC}"
    if [[ "$DRY_RUN" == false ]]; then
        find "$SKILLS_DIR" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
        find "$AGENTS_DIR" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
        echo -e "  ${GREEN}Removed.${NC}"
    fi
else
    echo -e "${GREEN}No broken symlinks.${NC}"
fi

echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "============================="
    echo -e "${YELLOW}DRY RUN - No files deleted.${NC}"
    echo "Run with --execute to delete files."
else
    echo "============================="
    echo -e "${GREEN}Cleanup complete.${NC}"
    echo ""
    echo "New sizes:"
    du -sh "${CLAUDE_DIR}/projects" "${CLAUDE_DIR}/debug" "${CLAUDE_DIR}/file-history" 2>/dev/null || true
fi
