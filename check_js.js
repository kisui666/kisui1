// Proper JavaScript syntax checker for game.js
// Handles strings, template literals with ${...}, line/block comments

const fs = require('fs');
const code = fs.readFileSync('c:\\Users\\19914\\Desktop\\1000\\games\\roguelike-shooter\\game.js', 'utf8');
const lines = code.split('\n');

let errors = [];
let braceDepth = 0;
let parenDepth = 0;
let bracketDepth = 0;
let braceStack = [];
let parenStack = [];
let bracketStack = [];

let inStr = null;      // string delimiter: ', ", or `
let inTpl = false;     // inside template literal
let inTplExpr = false; // inside ${...} expression
let tplDepth = 0;      // nested ${...} depth
let inLine = false;    // inside // comment
let inBlk = false;     // inside /* comment */

let tplStack = [];     // track template literal nesting

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    inLine = false; // reset line comment per line
    
    for (let j = 0; j < line.length; j++) {
        const c = line[j];
        const nxt = j + 1 < line.length ? line[j + 1] : '';
        const prev = j > 0 ? line[j - 1] : '';
        
        // Line comment
        if (inLine) continue;
        
        // Block comment
        if (inBlk) {
            if (c === '*' && nxt === '/') { inBlk = false; j++; }
            continue;
        }
        
        // Template literal expression ${...}
        if (inTplExpr) {
            if (c === '{') tplDepth++;
            else if (c === '}') {
                tplDepth--;
                if (tplDepth < 0) {
                    inTplExpr = false;
                    tplDepth = 0;
                    // Back in template literal mode
                }
            }
            // Track braces/parens/brackets inside template expression
            if (!inTpl) {
                // We're in a template expression, track normally
                if (c === '{') { braceDepth++; braceStack.push(i + 1); }
                else if (c === '}') { if (braceStack.length > 0) braceStack.pop(); braceDepth--; }
                else if (c === '(') { parenDepth++; parenStack.push(i + 1); }
                else if (c === ')') { if (parenStack.length > 0) parenStack.pop(); parenDepth--; }
                else if (c === '[') { bracketDepth++; bracketStack.push(i + 1); }
                else if (c === ']') { if (bracketStack.length > 0) bracketStack.pop(); bracketDepth--; }
            }
            continue;
        }
        
        // Template literal
        if (inTpl) {
            if (c === '`') {
                inTpl = false;
                // Pop template nesting
                if (tplStack.length > 0) tplStack.pop();
            } else if (c === '$' && nxt === '{') {
                inTplExpr = true;
                tplDepth = 0;
                j++; // skip the {
            } else if (c === '\\') {
                j++; // skip escaped char
            }
            continue;
        }
        
        // Regular string
        if (inStr) {
            if (c === '\\') { j++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        
        // Line comment start
        if (c === '/' && nxt === '/') {
            inLine = true;
            break; // skip rest of line
        }
        
        // Block comment start
        if (c === '/' && nxt === '*') {
            inBlk = true;
            j++;
            continue;
        }
        
        // String start
        if (c === '"' || c === "'") {
            inStr = c;
            continue;
        }
        
        // Template literal start
        if (c === '`') {
            inTpl = true;
            tplStack.push(i + 1);
            continue;
        }
        
        // Track braces, parens, brackets
        if (c === '{') { braceDepth++; braceStack.push(i + 1); }
        else if (c === '}') {
            if (braceStack.length === 0) {
                errors.push(`Line ${i+1}: Unmatched '}'`);
            } else {
                braceStack.pop();
            }
            braceDepth--;
        }
        else if (c === '(') { parenDepth++; parenStack.push(i + 1); }
        else if (c === ')') {
            if (parenStack.length === 0) {
                errors.push(`Line ${i+1}: Unmatched ')' - "${line.trim().substring(0, 80)}"`);
            } else {
                parenStack.pop();
            }
            parenDepth--;
        }
        else if (c === '[') { bracketDepth++; bracketStack.push(i + 1); }
        else if (c === ']') {
            if (bracketStack.length === 0) {
                errors.push(`Line ${i+1}: Unmatched ']'`);
            } else {
                bracketStack.pop();
            }
            bracketDepth--;
        }
    }
}

console.log(`Final brace depth: ${braceDepth}, stack: ${braceStack.slice(-5)}`);
console.log(`Final paren depth: ${parenDepth}, stack: ${parenStack.slice(-5)}`);
console.log(`Final bracket depth: ${bracketDepth}, stack: ${bracketStack.slice(-5)}`);
console.log(`Errors: ${errors.length}`);
errors.slice(0, 20).forEach(e => console.log(e));