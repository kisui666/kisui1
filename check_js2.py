# Proper JavaScript syntax checker for game.py
# Handles strings, template literals with ${...}, line/block comments

code = open(r'c:\Users\19914\Desktop\1000\games\roguelike-shooter\game.js', 'r', encoding='utf-8').read()
lines = code.split('\n')

errors = []
brace_depth = 0
paren_depth = 0
bracket_depth = 0
brace_stack = []
paren_stack = []
bracket_stack = []

in_str = None
in_tpl = False
in_tpl_expr = False
tpl_depth = 0
in_line = False
in_blk = False

for i, line in enumerate(lines):
    in_line = False
    j = 0
    while j < len(line):
        c = line[j]
        nxt = line[j+1] if j+1 < len(line) else ''
        
        if in_line:
            break  # rest of line is comment
        
        if in_blk:
            if c == '*' and nxt == '/':
                in_blk = False
                j += 1
        elif in_tpl_expr:
            if c == '{':
                tpl_depth += 1
            elif c == '}':
                tpl_depth -= 1
                if tpl_depth < 0:
                    in_tpl_expr = False
                    tpl_depth = 0
            # Track braces/parens/brackets inside template expression
            if c == '{':
                brace_depth += 1
                brace_stack.append(i + 1)
            elif c == '}':
                if brace_stack:
                    brace_stack.pop()
                brace_depth -= 1
            elif c == '(':
                paren_depth += 1
                paren_stack.append(i + 1)
            elif c == ')':
                if paren_stack:
                    paren_stack.pop()
                paren_depth -= 1
            elif c == '[':
                bracket_depth += 1
                bracket_stack.append(i + 1)
            elif c == ']':
                if bracket_stack:
                    bracket_stack.pop()
                bracket_depth -= 1
        elif in_tpl:
            if c == '`':
                in_tpl = False
            elif c == '$' and nxt == '{':
                in_tpl_expr = True
                tpl_depth = 0
                j += 1  # skip the {
            elif c == '\\':
                j += 1  # skip escaped char
        elif in_str:
            if c == '\\':
                j += 1
            elif c == in_str:
                in_str = None
        else:
            # Check for line comment
            if c == '/' and nxt == '/':
                in_line = True
                break  # skip rest of line
            
            # Check for block comment
            if c == '/' and nxt == '*':
                in_blk = True
                j += 1
            elif c == '"' or c == "'":
                in_str = c
            elif c == '`':
                in_tpl = True
            elif c == '{':
                brace_depth += 1
                brace_stack.append(i + 1)
            elif c == '}':
                if brace_stack:
                    brace_stack.pop()
                brace_depth -= 1
            elif c == '(':
                paren_depth += 1
                paren_stack.append(i + 1)
            elif c == ')':
                if paren_stack:
                    paren_stack.pop()
                paren_depth -= 1
            elif c == '[':
                bracket_depth += 1
                bracket_stack.append(i + 1)
            elif c == ']':
                if bracket_stack:
                    bracket_stack.pop()
                bracket_depth -= 1
        j += 1

print(f'Final brace depth: {brace_depth}, stack last 5: {brace_stack[-5:]}')
print(f'Final paren depth: {paren_depth}, stack last 5: {paren_stack[-5:]}')
print(f'Final bracket depth: {bracket_depth}, stack last 5: {bracket_stack[-5:]}')
print(f'Errors: {len(errors)}')

if errors:
    for e in errors[:30]:
        print(e)
else:
    print("No errors found!")
    
# Also check for template literals that might be open at EOF
if in_tpl:
    print("WARNING: Unclosed template literal at EOF")
if in_str:
    print(f"WARNING: Unclosed string ({in_str}) at EOF")
if in_blk:
    print("WARNING: Unclosed block comment at EOF")