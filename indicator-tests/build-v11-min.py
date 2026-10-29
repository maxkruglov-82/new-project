"""Alpha-rename long private identifiers outside strings; preserve Pine indentation."""
import re
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
ROOT = Path(__file__).resolve().parent.parent
spec = spec_from_file_location('compact_builder', Path(__file__).with_name('build-v11-compact.py'))
builder = module_from_spec(spec)
spec.loader.exec_module(builder)
source = builder.compact((ROOT / 'KRYTES_V1_1_LONDON.txt').read_text())
# Parameters and variables use explicit Pine types. Function names are declared at column zero.
names = set(re.findall(r'\b(?:bool|int|float|string|label|line|box|polyline|array<[^>]+>)\s+([A-Za-z_]\w*)', source))
names.update(re.findall(r'^([A-Za-z_]\w*)\([^\n]*\)\s*=>', source, re.M))
names = sorted(n for n in names if len(n) >= 12)
all_tokens = set(re.findall(r'\b[A-Za-z_]\w*\b', source))
replacement = {}
for name in names:
    candidate = f'q{len(replacement)}'
    assert candidate not in all_tokens
    replacement[name] = candidate

def rename(code, mapping):
    token = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|\b[A-Za-z_]\w*\b')
    return token.sub(lambda m: mapping.get(m.group(), m.group()) if m.group()[0] not in ('"', "'") else m.group(), code)

result = rename(source, replacement)
assert rename(result, {v:k for k,v in replacement.items()}) == source
assert result.startswith('//@version=5\n')
output = ROOT / 'KRYTES_V1_1_LONDON_MIN.txt'
output.write_text(result)
print(f'V1.1: {len(source.encode())} -> {len(result.encode())} bytes; {len(replacement)} private identifiers shortened; inverse transform exact')
