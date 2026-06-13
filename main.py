import sys
from pathlib import Path


_ROOT = Path(__file__).parent
for _src in (_ROOT / "agents").glob("*/src"):
    sys.path.insert(0, str(_src))

from gateway.main import app
