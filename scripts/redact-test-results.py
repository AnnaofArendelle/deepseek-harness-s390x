"""Keep CI authentication entries out of public test artifacts."""
import re,sys
from pathlib import Path
for path in Path(sys.argv[1]).rglob('*'):
 if not path.is_file():continue
 try:text=path.read_text()
 except (UnicodeError,OSError):continue
 text=re.sub(r'([?&]token=)[^\s&"<>]+',r'\1REDACTED',text)
 text=re.sub(r'\bsk-[A-Za-z0-9_-]{12,}', 'REDACTED_MODEL_KEY', text)
 path.write_text(text)
