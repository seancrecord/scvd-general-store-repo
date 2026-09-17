# PS3 absolute-path follow-up

The revised reader cohort remains seven strict passes from eight attempts.
This follow-up addresses its sole boundary failure: a reader interpreted a
parent-relative tarball path from the wrong working directory.

Protocol 3 supplies an exact npm installation command with the absolute path
to the supplied tarball, quoted for the shell. The filename comes from the
frozen package manifest. The same command installs successfully from either
the trial root or a nested consumer directory; a test also includes spaces,
a single quote, command-substitution syntax and a semicolon in the directory
name to prove they remain literal path characters. Invalid relative roots
and tarball filenames escaping the root are rejected. Logger paths are quoted
the same way. This improves instructions; it does not make prompt restrictions
a filesystem security boundary.

Both regression tests fail with the prior instruction and pass with the fix.
Logs and source hashes are in verification.json. The prior cohort directory
remains byte-identical, including its runner. Package and README bytes are
unchanged; this is a separately identified trial-protocol change. No new
reader trial, commit or publication occurred, and PS4 remains unstarted.

Claude Code is installed but was still signed out on recheck. Its role is
independent fresh-reader qualification: two sessions for each of the four
scenarios, actual package execution, preserved scope/exclusions and no inferred
permission to spend. It is not being asked to modify the implementation or
publish anything. The user can run `claude auth login` locally and complete
the browser sign-in; the installed CLI's help confirms this command. An
Anthropic run will transmit the same unpublished package/README and synthetic
trial material to that host. No sign-in or credential handling was attempted.
