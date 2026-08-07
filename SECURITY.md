# Security

## Supported version

Security fixes are provided for the latest release.

## Two intentionally different runtimes

The GitHub Pages app executes learner code inside Pyodide in the visitor's own
browser. It has no shared code-execution backend.

The native development server executes submitted Python in temporary local
directories. It is intended only for a trusted learner on their own machine.
It is not a hardened sandbox: do not bind it to a public interface, expose it
through a tunnel, or run untrusted code with it.

The server binds to `127.0.0.1` by default. Treat `--host` as an advanced,
trusted-network option.

## Reporting a vulnerability

Please report security concerns privately through GitHub's security advisory
flow rather than opening a public issue with exploit details.
