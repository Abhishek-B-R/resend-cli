import { Command } from '@commander-js/extra-typings';
import { INBOX_AGENT_ACTIONS, type InboxAgentAction } from 'resend';
import { runWrite } from '../../../lib/actions';
import type { GlobalOpts } from '../../../lib/client';
import { buildHelpText } from '../../../lib/help-text';
import { outputError } from '../../../lib/output';
import { pickId } from '../../../lib/prompts';
import { snakeCaseAlias } from '../../../lib/snake-case-alias';
import { inboxAgentPath, inboxPickerConfig, resolveIdInputs } from '../utils';

// The SDK still sends enabled_actions for the inbox agent, so this command
// calls the endpoint directly until it ships the actions field
interface UpdateInboxAgentSettings {
  instructions?: string | null;
  tone?: string | null;
  actions?: InboxAgentAction[];
}

interface UpdateInboxAgentResult {
  object: 'inbox_agent';
  id: string;
}

export const updateInboxAgentCommand = new Command('update')
  .description("Update an inbox's agent instructions, tone, or actions")
  .argument('[inboxId]', 'Inbox UUID')
  .option('--inbox-id <id>', 'Inbox UUID')
  .addOption(snakeCaseAlias('--inbox-id <id>'))
  .option(
    '--instructions <text>',
    'Instructions the agent follows (max 4000 characters)',
  )
  .option(
    '--tone <tone>',
    'Tone preset or custom text the agent writes in (max 64 characters)',
  )
  .option(
    '--actions <actions...>',
    `Replace the allowed actions (comma or space-separated): ${INBOX_AGENT_ACTIONS.join(', ')}`,
  )
  .addHelpText(
    'after',
    buildHelpText({
      context: `At least one of --instructions, --tone, or --actions is required.
Omitted fields keep their current value.
--tone takes a preset (concise_professional, concise_casual, expanded_professional, expanded_casual)
or custom text in your own words, such as "friendly and concise".
Pass --instructions "" or --tone "" to clear the value.
--actions replaces the whole set. Duplicates are removed. Pass --actions "" to disable all actions.`,
      output: `  {"object":"inbox_agent","id":"<uuid>"}`,
      errorCodes: [
        'auth_error',
        'no_changes',
        'invalid_actions',
        'update_error',
      ],
      examples: [
        'resend inboxes agent update <inbox-id> --instructions "Answer refund questions yourself."',
        'resend inboxes agent update <inbox-id> --actions draft_reply add_labels --json',
        'resend inboxes agent update <inbox-id> --tone concise_professional',
        'resend inboxes agent update <inbox-id> --tone ""',
      ],
    }),
  )
  .action(async (inboxIdArg, opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals() as GlobalOpts;

    if (
      opts.instructions === undefined &&
      opts.tone === undefined &&
      opts.actions === undefined
    ) {
      outputError(
        {
          message:
            'Provide at least one option to update: --instructions, --tone, or --actions.',
          code: 'no_changes',
        },
        { json: globalOpts.json },
      );
    }

    const actions = opts.actions
      ?.flatMap((a) => a.split(','))
      .map((a) => a.trim())
      .filter(Boolean);
    const invalid = actions?.filter(
      (a) => !(INBOX_AGENT_ACTIONS as readonly string[]).includes(a),
    );
    if (invalid?.length) {
      outputError(
        {
          message: `Invalid --actions value: ${invalid.join(', ')}. Use: ${INBOX_AGENT_ACTIONS.join(', ')}.`,
          code: 'invalid_actions',
        },
        { json: globalOpts.json },
      );
    }

    const ids = resolveIdInputs(
      { inbox: [inboxIdArg, opts.inboxId] },
      globalOpts,
    );
    const inboxId = await pickId(ids.inbox, inboxPickerConfig, globalOpts);

    const settings: UpdateInboxAgentSettings = {
      ...(opts.instructions !== undefined && {
        instructions: opts.instructions || null,
      }),
      ...(opts.tone !== undefined && { tone: opts.tone || null }),
      ...(actions && { actions: actions as InboxAgentAction[] }),
    };

    await runWrite(
      {
        loading: 'Updating agent settings...',
        sdkCall: (resend) =>
          resend.patch<UpdateInboxAgentResult>(
            inboxAgentPath(inboxId),
            settings,
          ),
        errorCode: 'update_error',
        successMsg: `Agent settings updated for inbox: ${inboxId}`,
      },
      globalOpts,
    );
  });
