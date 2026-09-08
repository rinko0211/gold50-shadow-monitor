# Gold50 Shadow Monitor

Independent, read-only Phase C shadow monitor for `TQQQ-Gold50-Research-v0.1`.

This repository does not write to or modify `rinko0211/tqqq-signal-lab`. It consumes the incumbent public `signal.json` / `status.json` read-only, obtains GLD EOD data from Tiingo using a repository secret, runs the frozen Gold50 mapper, and records only sanitized Phase C evidence suitable for a public repository.
