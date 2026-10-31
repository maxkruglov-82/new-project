"""Reduce whitespace only; preserve tokens, strings, newlines and Pine block depths."""
from pathlib import Path
import re
import sys
root=Path(__file__).resolve().parent.parent
p=root/(sys.argv[1] if len(sys.argv)>1 else 'KRYTES_V1_LONDON_STRUCTURE_MIN.txt')
s=p.read_text()
token=re.compile(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|:=|=>|==|!=|<=|>=|\+=|-=|\*=|/=|[^\s]''')
lines=[]
for line in s.splitlines():
 if line.startswith('//@'):
  lines.append(line);continue
 prefix=re.match(r'[ \t]*',line).group()
 body=line[len(prefix):]
 ts=token.findall(body)
 # Only remove spaces beside punctuation which cannot form new operators.
 small=re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[^"\']+',lambda m:m.group() if m.group()[0] in ('"',"'") else re.sub(r'\s*([(),\[\]])\s*',r'\1',m.group()),body)
 assert token.findall(small)==ts
 # Pine accepts one tab for each block indentation level (four spaces).
 indent=prefix.replace('    ','\t')
 assert indent.expandtabs(4)==prefix.expandtabs(4)
 lines.append(indent+small)
out='\n'.join(lines)+'\n'
(root/(sys.argv[2] if len(sys.argv)>2 else 'KRYTES_V1_LONDON_STRUCTURE_SMALL.txt')).write_text(out)
print(len(s.encode()),'->',len(out.encode()),'bytes; tokens and indentation identical')
