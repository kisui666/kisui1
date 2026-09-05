import re

code = open(r'c:\Users\19914\Desktop\1000\games\roguelike-shooter\game.js','r',encoding='utf-8').read()
lines = code.split('\n')

# Check for potential regex literals (something that looks like /pattern/)
# We need to be careful not to match division operators
in_str = None
in_tpl = False
in_line = False
in_blk = False

for i, line in enumerate(lines, 1):
    j = 0
    in_line = False
    while j < len(line):
        c = line[j]
        nxt = line[j+1] if j+1 < len(line) else ''
        prev = line[j-1] if j > 0 else ''
        
        if in_line:
            pass
        elif in_blk:
            if c == '*' and nxt == '/':
                in_blk = False
                j += 1
        elif in_str:
            if c == '\\':
                j += 1
            elif c == in_str:
                in_str = None
        elif in_tpl:
            if c == '\\':
                j += 1
            elif c == '`':
                in_tpl = False
        else:
            if c == '/' and nxt == '/':
                in_line = True
                j += 1
            elif c == '/' and nxt == '*':
                in_blk = True
                j += 1
            elif c == '"' or c == "'":
                in_str = c
            elif c == '`':
                in_tpl = True
            elif c == '/':
                # Potential regex literal or division
                # Check if previous char could be end of regex vs division
                # Heuristic: if preceded by '=', '(', '[', ',', '!', '&', '|', '?', ':', or start of line
                # it's likely a regex
                context_before = line[max(0:j-5):j].strip()
                if not context_before or context_before[-1] in '=([,!&|?:{};':
                    # Likely a regex, try to find closing /
                    # Look ahead for the closing /
                    k = j + 1
                    found_close = False
                    while k < len(line):
                        if line[k] == '\\':
                            k += 1
                        elif line[k] == '/':
                            found_close = True
                            break
                        elif line[k] in 'gi' and k > j + 10:
                            break
                        k += 1
                    if not found_close:
                        # Could be a division, not regex
                        pass
        j += 1

print("Check complete")

# Now let's look for template literals with potential issues
print("\nSearching for template literals with issues...")
for i, line in enumerate(lines, 1):
    if '`' in line:
        # Count backticks
        count = line.count('`')
        if count % 2 != 0:
            print(f"Line {i}: Odd number of backticks ({count}): {line.strip()[:100]}")

# Look for common syntax error patterns
print("\nSearching for potential syntax issues...")
for i, line in enumerate(lines, 1):
    # Check for lines that might be problematic
    stripped = line.strip()
    # Multiple closing parens without opens
    if stripped.count(')') > stripped.count('(') + 2 and 'function' not in stripped and '=>' not in stripped:
        pass  # Could be OK in context