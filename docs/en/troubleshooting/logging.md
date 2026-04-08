# Where to Look When Something Breaks

If the plugin seems to be doing nothing, logs are usually the fastest way to understand why.

## Good times to check logs

- Auto capture is not creating new memories
- The WebUI does not behave as expected
- Search results seem wrong
- Provider or embedding setup fails

## Default log location

The default log file is:

`~/.opencode-mem/opencode-mem.log`

If you changed the log environment variable, the file may be somewhere else.

## Important note for project-level config

People often assume that project-level config also makes logs project-local.

In the current repo, that is not the default behavior.

By default:

- config can be overridden per project
- stored data can also be made project-local through `storagePath`
- but logs still default to the global path

That means the default log file is still:

`~/.opencode-mem/opencode-mem.log`

If you want logs inside a project, you need to set:

`OPENCODE_MEM_LOG_FILE`

## What logs can tell you

- Whether the plugin started correctly
- Whether auto capture actually triggered
- Whether the provider or embedding layer failed
- Which step succeeded and which step failed

## A practical order for debugging

1. Check whether plugin startup looks normal
2. Check whether the feature you care about actually triggered
3. Find the first clear error around that point

## One important caution

Logs can include prompt snippets, model output snippets, and local path information.

That means:

- They are very useful for your own debugging
- They should be sanitized before you share them with someone else
