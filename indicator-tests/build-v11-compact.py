"""Generate a compact Pine file; preserve all code, indentation and string literals."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'KRYTES_V1_1_LONDON.txt'
OUTPUT = ROOT / 'KRYTES_V1_1_LONDON_COMPACT.txt'


def strip_comment(line):
    quote = None
    escaped = False
    for index, char in enumerate(line):
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
        elif char in ('"', "'"):
            quote = char
        elif line[index:index + 2] == '//':
            return line[:index].rstrip()
    return line.rstrip()


def compact(source):
    lines = []
    for line in source.splitlines():
        if line.strip().startswith('//@version='):
            lines.append(line.strip())
            continue
        code = strip_comment(line)
        if code.strip():
            lines.append(code)
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    text = SOURCE.read_text()
    result = compact(text)
    assert compact(result) == result
    assert result.startswith('//@version=5\n')
    assert strip_comment('    x = "https://a/b" // comment') == '    x = "https://a/b"'
    OUTPUT.write_text(result)
    print(f'V1.1: {len(text.encode())} bytes -> {len(result.encode())} bytes')
