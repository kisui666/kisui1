import re

code = open(r'c:\Users\19914\Desktop\1000\games\roguelike-shooter\game.js','r',encoding='utf-8').read()
lines = code.split('\n')
depth = 0
stack = []
in_str = None
in_tpl = False
in_line = False
in_blk = False

for i, line in enumerate(lines, 1):
    j = 0
    in_line = False  # Reset line comment at start of each line
    while j < len(line):
        c = line[j]
        nxt = line[j+1] if j+1 < len(line) else ''
        
        if in_line:
            pass  # single line comment, skip
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
                stack.append(i)
            elif c == '}':
                if stack:
                    stack.pop()
                depth -= 1
        j += 1
    
    if i in [1062, 1084, 1132, 1229, 1230, 1231, 1232, 1410, 1411, 3977, 3978]:
        print(f'Line {i}: depth={depth} stack={stack[-5:]}')

print(f'Final depth: {depth}, stack={stack[-10:]}')