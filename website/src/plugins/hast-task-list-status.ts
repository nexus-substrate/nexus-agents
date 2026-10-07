/**
 * GFM task lists describe progress; their disabled inputs are not a form.
 * Read the status as text beside the task, including in readers that skip
 * disabled controls. The decorative glyph is hidden from assistive tech.
 */
import { defineHastPlugin, type HastPluginDefinition } from 'satteri';

export default function hastTaskListStatus(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-task-list-status',
    element: {
      filter: ['input'],
      visit(node, ctx) {
        if (node.properties.type !== 'checkbox' || !node.properties.disabled) return;
        // Tight lists put the input directly in li; loose lists wrap it in p.
        const parent = ctx.parent(node);
        const item = parent.type === 'element' && parent.tagName === 'p'
          ? ctx.parent(parent)
          : parent;
        if (item.type !== 'element' || item.tagName !== 'li') return;
        const classes = item.properties.className;
        if (!Array.isArray(classes) || !classes.includes('task-list-item')) return;

        const done = Boolean(node.properties.checked);
        ctx.replaceNode(node, [
          {
            type: 'element', tagName: 'span', properties: { ariaHidden: 'true' },
            children: [{ type: 'text', value: done ? '☑' : '☐' }],
          },
          {
            type: 'element', tagName: 'span', properties: { className: ['visually-hidden'] },
            children: [{ type: 'text', value: done ? 'Done: ' : 'Not done: ' }],
          },
        ]);
      },
    },
  });
}
