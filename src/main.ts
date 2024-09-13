import { App, Plugin, PluginSettingTab, Setting, moment, FileExplorer, WorkspaceLeaf, TFile, FrontMatterCache } from 'obsidian';

import { init as initI18n } from './i18n'
import i18next from 'i18next';

interface ListItem {
  key: string
  type: FrontmatterType
  format?: string
}

interface PluginSettings {
  list: Array<ListItem>;
  separator: string
}

enum FrontmatterType {
  Raw = 'raw',
  Date = 'date'
}

const FrontmatterType_TYPES = [
  FrontmatterType.Raw,
  FrontmatterType.Date,
]

const DEFAULT_SETTINGS: PluginSettings = {
  list: [
    {
      key: '',
      type: FrontmatterType.Raw
    }
  ],
  separator: '|'
}

export default class ErikaPlugin extends Plugin {
  settings: PluginSettings;
  fileExplorer?: FileExplorer;

  async onload() {
    await initI18n()

    await this.loadSettings();

    this.addSettingTab(new SettingTab(this.app, this));

    this.init()

    this.registerEvent(
      this.app.metadataCache.on("changed", async (file) => {
        this.updateFileDisplay(file)
      })
    );
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async saveAndUpdateDisplay() {
    this.updateFileExplorer()
    await this.saveData(this.settings);
  }

  init() {
    this.app.workspace.onLayoutReady(async () => {
      try {
        const leaf = await this.getFileExplorerLeaf()
        this.fileExplorer = leaf.view as FileExplorer
        this.updateFileExplorer()
      } catch (error) {
        console.error(error);
        setTimeout(() => {
          this.init()
        }, 1000);
      }
    })
  }

  async getFileExplorerLeaf() {
    return new Promise<WorkspaceLeaf>((resolve, reject) => {
      let foundLeaf: WorkspaceLeaf | null = null;
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (foundLeaf) {
          return;
        }

        const view = leaf.view as FileExplorer;
        if (!view || !view.fileItems) {
          return;
        }

        foundLeaf = leaf;
        resolve(foundLeaf);
      });

      if (!foundLeaf) {
        reject(Error("Could not find file explorer leaf"));
      }
    });
  }

  updateFileExplorer() {
    if (!this.fileExplorer) {
      return
    }

    const { fileItems } = this.fileExplorer

    for (const path in fileItems) {
      const { file } = fileItems[path];
      if (file instanceof TFile) {
        this.updateFileDisplay(file)
      }
    }
  }

  updateFileDisplay(file: TFile) {
    if (!this.fileExplorer) {
      return
    }
    const { fileItems } = this.fileExplorer
    const { selfEl } = fileItems[file.path];
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
    const text = this.calcDisplayText(frontmatter)
    selfEl.setAttribute('data-erika-value', text)
  }

  calcDisplayText(frontmatter?: FrontMatterCache) {
    if (!frontmatter) {
      return ''
    }
    return this.settings.list.map(({ key, type, format }) => {
      switch (type) {
        case FrontmatterType.Raw:
          return frontmatter[key] || ''
        case FrontmatterType.Date:
          return frontmatter[key] ? moment(frontmatter[key]).format(format) : ''
        default:
          return ''
      }
    }).filter(i => i.length > 0).join(` ${this.settings.separator} `)
  }

}

class SettingTab extends PluginSettingTab {
  plugin: ErikaPlugin;

  constructor(app: App, plugin: ErikaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName(i18next.t('general.separator.name'))
      .setDesc(i18next.t('general.separator.desc'))
      .addText((text) => {
        text
          .setValue(this.plugin.settings.separator)
          .onChange(async (value) => {
            this.plugin.settings.separator = value
            await this.plugin.saveAndUpdateDisplay();
          })
      });

    for (let i = 0; i < this.plugin.settings.list.length; i++) {
      const item = this.plugin.settings.list[i]
      const hasMore = i > 0
      const order = hasMore ? `${i + 1}` : ''

      const header = new Setting(containerEl)
        .setHeading()
        .setName(i18next.t('list.header.text') + order)

      if (hasMore) {
        header.addButton(c => {
          c.setIcon('trash-2')
            .setClass('color-red')
            .setTooltip(i18next.t('list.button.remove'))
            .onClick(async () => {
              this.plugin.settings.list.splice(i, 1)
              this.display()
              await this.plugin.saveAndUpdateDisplay()
            })
        })
      }

      new Setting(containerEl)
        .setName(i18next.t('list.type.name'))
        .setDesc(i18next.t('list.type.desc'))
        .addDropdown((drop) => {
          for (const type of FrontmatterType_TYPES) {
            drop.addOption(type, i18next.t(`frontmatter.${type}`));
          }

          drop
            .setValue(item.type)
            .onChange(async (value: FrontmatterType) => {
              item.type = value
              this.display()
              await this.plugin.saveAndUpdateDisplay();
            });
        });

      new Setting(containerEl)
        .setName(i18next.t('list.key.name'))
        .setDesc(i18next.t('list.key.desc'))
        .addText((text) => {
          text
            .setValue(item.key)
            .onChange(async (value) => {
              item.key = value
              await this.plugin.saveAndUpdateDisplay();
            })
        });

      if (item.type == FrontmatterType.Date) {
        const createDesc = () => {
          const fragment = document.createDocumentFragment();
          fragment.append(
            i18next.t('list.format.desc'),
            fragment.createEl('br'),
            i18next.t('list.format.visit'),
            fragment.createEl('a', {
              href: 'https://momentjs.com/docs/#/displaying/format/',
              text: i18next.t('list.format.doc'),
            }),
            fragment.createEl('br'),
            i18next.t('list.format.example', {
              value: moment().format(item.format)
            }),
          );
          return fragment;
        };

        const formatControl =
          new Setting(containerEl)
            .setName(i18next.t('list.format.name'))
            .setDesc(createDesc())
            .addText((text) => {
              text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(item.format || '')
                .onChange(async (value) => {
                  item.format = value
                  formatControl.setDesc(createDesc())
                  await this.plugin.saveAndUpdateDisplay();
                })
            });
      }
    }


    new Setting(this.containerEl)
      .addButton((cb) => {
        cb.setButtonText(i18next.t('list.button.add'))
          .setCta()
          .onClick(async () => {
            this.plugin.settings.list.push({
              key: '',
              type: FrontmatterType.Raw
            })
            this.display()
            await this.plugin.saveAndUpdateDisplay()
          });
      });

  }
}
