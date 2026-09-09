// Public demonstration bookmarks for screenshots. No personal browser data is used.
export function createDemoTree(locale = 'en') {
  const zh = locale === 'zh_CN'
  let sequence = 100
  const link = (title, url) => ({ id: String(sequence++), title, url })
  const folder = (en, cn, children) => ({ id: String(sequence++), title: zh ? cn : en, children })
  const development = folder('Development', '开发', [
    folder('Frontend', '前端开发', [link('Vue.js', 'https://vuejs.org'), link('Vite', 'https://vite.dev'), link('Pinia', 'https://pinia.vuejs.org'), link('VueUse', 'https://vueuse.org'), link('Tailwind CSS', 'https://tailwindcss.com'), link('TypeScript', 'https://www.typescriptlang.org')]),
    link('GitHub', 'https://github.com'), link('MDN Web Docs', 'https://developer.mozilla.org'), link('npm', 'https://www.npmjs.com'), link('Node.js', 'https://nodejs.org'), link('Chrome Developers', 'https://developer.chrome.com'), link('web.dev', 'https://web.dev'),
  ])
  const items = [
    development,
    folder('Design studio', '设计灵感', [link('Figma', 'https://www.figma.com'), link('Dribbble', 'https://dribbble.com'), link('Behance', 'https://www.behance.net'), link('Unsplash', 'https://unsplash.com'), link('Coolors', 'https://coolors.co')]),
    folder('Reading list', '稍后阅读', [link('A List Apart', 'https://alistapart.com'), link('Smashing Magazine', 'https://www.smashingmagazine.com'), link('CSS-Tricks', 'https://css-tricks.com'), link('MDN Web Docs', 'https://developer.mozilla.org'), link('web.dev', 'https://web.dev')]),
    folder('Work', '工作空间', [link('Notion', 'https://www.notion.so'), link('Linear', 'https://linear.app'), link('Slack', 'https://slack.com'), link('Figma', 'https://www.figma.com')]),
    folder('Research', '研究资料', [link('arXiv', 'https://arxiv.org'), link('Wikipedia', 'https://www.wikipedia.org'), link('Our World in Data', 'https://ourworldindata.org'), link('Internet Archive', 'https://archive.org')]),
    folder('Everyday', '日常工具', [link('OpenStreetMap', 'https://www.openstreetmap.org'), link('DeepL', 'https://www.deepl.com'), link('Excalidraw', 'https://excalidraw.com'), link('Squoosh', 'https://squoosh.app')]),
    link('GitHub', 'https://github.com'), link('MDN Web Docs', 'https://developer.mozilla.org'), link('Vite', 'https://vite.dev'), link('Vue.js', 'https://vuejs.org'),
    link('TypeScript', 'https://www.typescriptlang.org'), link('Tailwind CSS', 'https://tailwindcss.com'), link('Figma', 'https://www.figma.com'), link('Notion', 'https://www.notion.so'),
    link('Linear', 'https://linear.app'), link('CodePen', 'https://codepen.io'), link('Stack Overflow', 'https://stackoverflow.com'), link('DevDocs', 'https://devdocs.io'),
    link('Can I use', 'https://caniuse.com'), link('Dribbble', 'https://dribbble.com'), link('Unsplash', 'https://unsplash.com'), link('Excalidraw', 'https://excalidraw.com'),
    link('Squoosh', 'https://squoosh.app'), link('Internet Archive', 'https://archive.org'),
  ]
  const tree = [{ id: '0', title: '', children: [{ id: '1', title: zh ? '书签栏' : 'Bookmarks bar', children: items }, { id: '2', title: zh ? '其他书签' : 'Other bookmarks', children: [] }] }]
  const attach = (nodes, parentId) => nodes.forEach((node, index) => { if (parentId) node.parentId = parentId; node.index = index; if (node.children) attach(node.children, node.id) })
  attach(tree)
  return tree
}
