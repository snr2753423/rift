---
paths:
  - "**/*.py"
  - "**/*.pyi"
---

# Python Security

> This file extends the common security rule with Python specific content.

## Secret Management

```python
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ["OPENAI_API_KEY"]  # Raises KeyError if missing
```

## Security Scanning (END-ONLY — run only at the very end of the project or when the user explicitly asks; deferred security audit, see hackathon-mode §3)

- Use **bandit** for static security analysis (END-ONLY):
  ```bash
  bandit -r src/
  ```

## Reference

