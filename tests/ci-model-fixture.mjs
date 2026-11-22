/** Keyless CI-only adapter: scripted responses exercise the real tool executor and jobs. */
import {randomUUID} from 'node:crypto';
import {LlmAdapter} from '@deepseek-ai/dsh-llm';

const commands = {
  DSH_CI_FIRST: {command: "printf FIRST_TURN > ci-agent.txt; cat ci-agent.txt", description: 'Create and read the CI acceptance file'},
  DSH_CI_SECOND: {command: "sed -i s/FIRST_TURN/SECOND_TURN/ ci-agent.txt; cat ci-agent.txt", description: 'Edit and read the CI acceptance file'},
  DSH_CI_BACKGROUND: {command: "printf DSH_CI_BACKGROUND_STARTED; sleep 8; printf BG_COMPLETE > ci-background.txt", description: 'Run the disconnected background acceptance job', run_in_background: true},
  DSH_CI_STOP: {command: "printf DSH_CI_STOP_STARTED; sleep 300; printf SHOULD_NOT_FINISH > ci-stopped.txt", description: 'Run the stoppable background acceptance job', run_in_background: true},
};
const textOf = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
class ScriptedAdapter extends LlmAdapter {
  async listModels(provider) { return [{provider, id: 'ci-scripted', name: 'CI scripted fixture'}]; }
  async resolveModel(provider, model) { return {provider, id: model, name: model, contextWindow: 128000}; }
  async *stream(options) {
    options.signal?.throwIfAborted();
    let selected, start = -1;
    for (let i = options.messages.length - 1; i >= 0; i--) {
      const message = options.messages[i];
      if (message.role !== 'user') continue;
      const text = textOf(message);
      const marker = Object.keys(commands).find(key => text.includes(key));
      if (marker) { selected = marker; start = i; break; }
    }
    if (selected && !options.messages.slice(start + 1).some(message => message.role === 'tool')) {
      const id = 'ci-' + randomUUID(), args = JSON.stringify(commands[selected]);
      yield {type: 'block-start', index: 0, blockType: 'tool-call'};
      yield {type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args};
      yield {type: 'block-end', index: 0, block: {type: 'tool-call', id, name: 'bash', arguments: args}};
      yield {type: 'usage', usage: {inputTokens: 16, outputTokens: 8}};
      yield {type: 'finish', reason: {kind: 'tool-calls'}};
    } else {
      const text = selected ? selected + '_DONE' : 'CI scripted fixture';
      yield {type: 'block-start', index: 0, blockType: 'text'};
      yield {type: 'text-delta', index: 0, text};
      yield {type: 'block-end', index: 0, block: {type: 'text', text}};
      yield {type: 'usage', usage: {inputTokens: 16, outputTokens: 8}};
      yield {type: 'finish', reason: {kind: 'stop'}};
    }
  }
}
export const inject = ['llm'];
export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter(['s390x-ci-fixture'], new ScriptedAdapter()));
}
