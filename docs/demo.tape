# Records docs/demo.gif with charmbracelet/vhs (needs ttyd, ffmpeg and a logged-in `claude` CLI).
# Run from the repo root: vhs docs/demo.tape
# The "Thinking…" waits in the committed GIF were then sped up 6x with ffmpeg (select filter on those frames).

Output docs/demo.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 680
Set Framerate 20
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type `clear && bun index.tsx --model haiku -i 'Keep answers under 60 words.'`
Enter
Sleep 2s
Show

# Ask: the answer streams in segment by segment
Type "Why do leaves change color in autumn?"
Sleep 400ms
Enter
Sleep 15s

# Cycle segments, focus one, then ask about it (new branch)
Tab
Sleep 700ms
Tab
Sleep 700ms
Enter
Sleep 1s
Type "Why does chlorophyll break down?"
Sleep 400ms
Enter
Sleep 15s

# Back up, then reopen the existing branch
Escape
Sleep 1.5s
Enter
Sleep 2s

# Outline of the whole tree
Ctrl+T
Sleep 2.5s
Escape
Sleep 500ms
Type "q"
Sleep 500ms
