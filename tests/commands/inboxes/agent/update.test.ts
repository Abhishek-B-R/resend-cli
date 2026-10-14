import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { updateInboxAgentCommand } from '../../../../src/commands/inboxes/agent/update';
import {
  captureTestEnv,
  expectExit1,
  mockExitThrow,
  mockSdkError,
  setNonInteractive,
  setupOutputSpies,
} from '../../../helpers';

const INBOX_ID = '78261eea-8f8b-4381-83c6-79fa7120f1cf';
const AGENT_ID = 'a1f84a4e-6f2b-4f0a-9c1d-8a2e5b3c7d90';
const AGENT_PATH = `/inboxes/${INBOX_ID}/agent`;

const mockPatch = vi.fn(async () => ({
  data: { object: 'inbox_agent' as const, id: AGENT_ID },
  error: null,
}));

vi.mock('resend', async (importOriginal) => {
  const original = await importOriginal<typeof import('resend')>();
  return {
    INBOX_AGENT_ACTIONS: original.INBOX_AGENT_ACTIONS,
    Resend: class MockResend {
      constructor(public key: string) {}
      patch = mockPatch;
    },
  };
});

describe('inboxes agent update command', () => {
  const restoreEnv = captureTestEnv();
  let errorSpy: MockInstance | undefined;
  let exitSpy: MockInstance | undefined;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockPatch.mockClear();
  });

  afterEach(() => {
    restoreEnv();
    errorSpy?.mockRestore();
    exitSpy?.mockRestore();
    errorSpy = undefined;
    exitSpy = undefined;
  });

  it('updates instructions and actions', async () => {
    setupOutputSpies();

    await updateInboxAgentCommand.parseAsync(
      [
        '--inbox-id',
        INBOX_ID,
        '--instructions',
        'Answer refund questions yourself.',
        '--actions',
        'draft_reply,add_labels',
        'archive_thread',
      ],
      { from: 'user' },
    );

    expect(mockPatch).toHaveBeenCalledWith(AGENT_PATH, {
      instructions: 'Answer refund questions yourself.',
      actions: ['draft_reply', 'add_labels', 'archive_thread'],
    });
  });

  it('accepts the inbox ID as an argument', async () => {
    setupOutputSpies();

    await updateInboxAgentCommand.parseAsync([INBOX_ID, '--tone', 'calm'], {
      from: 'user',
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(AGENT_PATH, { tone: 'calm' });
  });

  it('accepts the snake_case --inbox_id flag', async () => {
    setupOutputSpies();

    await updateInboxAgentCommand.parseAsync(
      ['--inbox_id', INBOX_ID, '--actions', 'draft_reply,add_labels'],
      { from: 'user' },
    );

    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(AGENT_PATH, {
      actions: ['draft_reply', 'add_labels'],
    });
  });

  it('sends null for an empty --tone and an empty list for --actions ""', async () => {
    setupOutputSpies();

    await updateInboxAgentCommand.parseAsync(
      ['--inbox-id', INBOX_ID, '--tone', '', '--actions', ''],
      { from: 'user' },
    );

    expect(mockPatch).toHaveBeenCalledWith(AGENT_PATH, {
      tone: null,
      actions: [],
    });
  });

  it('errors with no_changes when no option is given', async () => {
    setNonInteractive();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = mockExitThrow();

    await expectExit1(() =>
      updateInboxAgentCommand.parseAsync(['--inbox-id', INBOX_ID], {
        from: 'user',
      }),
    );

    const output = errorSpy.mock.calls.map((c) => c[0]).join(' ');
    expect(output).toContain('no_changes');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('errors with invalid_actions for an unknown action', async () => {
    setNonInteractive();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = mockExitThrow();

    await expectExit1(() =>
      updateInboxAgentCommand.parseAsync(
        ['--inbox-id', INBOX_ID, '--actions', 'reply'],
        { from: 'user' },
      ),
    );

    const output = errorSpy.mock.calls.map((c) => c[0]).join(' ');
    expect(output).toContain('invalid_actions');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('errors with update_error when SDK returns an error', async () => {
    setNonInteractive();
    mockPatch.mockResolvedValueOnce(
      mockSdkError(
        'The tone must be 64 characters or less.',
        'validation_error',
      ) as never,
    );
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = mockExitThrow();

    await expectExit1(() =>
      updateInboxAgentCommand.parseAsync(
        ['--inbox-id', INBOX_ID, '--tone', 'calm'],
        { from: 'user' },
      ),
    );

    const output = errorSpy.mock.calls.map((c) => c[0]).join(' ');
    expect(output).toContain('update_error');
  });
});
