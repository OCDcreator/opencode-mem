# How Auto Capture Works

Auto capture is the most hands-off part of the plugin.

You talk to AI, edit code, run tools, and work normally. When that round of work settles down, the plugin decides whether there is something worth keeping and turns it into a reusable memory.

## What you get

- A shorter and cleaner project memory
- Context that may be linked back to the original prompt
- Tags that make future search easier

The point is not to store the whole chat exactly as-is. The point is to keep the parts that will still be useful later.

## When it runs

Usually after the current session becomes idle.

In plain language: once your current round of work has calmed down, the plugin may do a background pass and save the useful parts.

## Good candidates for saving

- Solutions that already worked
- Project rules, constraints, and decisions
- Causes of bugs and how they were fixed
- Implementation details that are likely to matter again

## Things that may not be saved

- Very short or vague chats
- Temporary experiments
- Discussions that never reached a conclusion

So if you do not see a new memory every time, that does not always mean something failed. It often means the plugin decided that the conversation was not worth keeping long term.

## How to check whether it worked

- Open the WebUI and look for new memories
- Search for a keyword from the conversation
- Watch for success notifications if you enabled them

The goal of auto capture is not “save everything”. It is “save the parts that are worth finding again later”.
