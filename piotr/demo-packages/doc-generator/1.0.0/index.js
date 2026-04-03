const fs = require('node:fs');
const path = require('node:path');

function renderReadme({ title, summary, sections = [] }) {
  const templatePath = path.join(__dirname, 'templates', 'README.tpl');
  const template = fs.readFileSync(templatePath, 'utf8');
  const renderedSections = sections
    .map((section) => `## ${section.heading}\n\n${section.body}`)
    .join('\n\n');

  return template
    .replaceAll('{{title}}', title)
    .replaceAll('{{summary}}', summary)
    .replaceAll('{{sections}}', renderedSections);
}

module.exports = {
  renderReadme
};
