import re

code = open(r'c:\Users\19914\Desktop\1000\games\roguelike-shooter\game.js','r',encoding='utf-8').read()
lines = code.split('\n')
depth = 0
paren_depth = 0
stack = []
in_str = None
in_tpl = False
in_line = False
in_blk = False

# Check for parentheses issues specifically
# Track line by line
for i, line in enumerate(lines, 1):
    j = 0
    in_line = False
    while j < len(line):
        c = line[j]
        nxt = line[j+1] if j+1 < len(line) else ''
        
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
            elif c == '{':
                depth += 1
                stack.append(('{', i))
            elif c == '}':
                if stack and stack[-1][0] == '{':
                    stack.pop()
                depth -= 1
            elif c == '(':
                paren_depth += 1
            elif c == ')':
                paren_depth -= 1
                if paren_depth < 0:
                    print(f'ERROR: Line {i}: Unmatched closing parenthesis!')
                    print(f'  Content: {line.strip()[:100]}')
                    paren_depth = 0
        j += 1

print(f'Final brace depth: {depth}, stack size: {len(stack)}')
print(f'Final paren depth: {paren_depth}')
if stack:
    print(f'Unclosed braces opened at lines: {[s[1] for s in stack[-10:]]}')