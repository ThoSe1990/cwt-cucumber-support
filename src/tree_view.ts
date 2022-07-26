
import * as fs from 'fs';
import * as path from 'path';
import * as rd from 'readline';
import * as vscode from 'vscode';

export namespace cwt
{
    class tree_item extends vscode.TreeItem 
    {
        file: string | undefined;
        line: number | undefined;

        children: tree_item[] = [];

        constructor(label: string, file?: string, line?: number) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.file = file;
            this.line = line;
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        public make_collapsible () {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        
    }
    
    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        private m_data : tree_item [] = [];
        private m_onDidChangeTreeData: vscode.EventEmitter<tree_item | undefined> = new vscode.EventEmitter<tree_item | undefined>();
        readonly onDidChangeTreeData ? : vscode.Event<tree_item | undefined> = this.m_onDidChangeTreeData.event;

        public constructor() 
        {
            vscode.commands.registerCommand('cwt_cucumber.item_clicked', r => this.item_clicked(r));
            vscode.commands.registerCommand('cwt_cucumber.refresh', () => this.refresh());
        }

        public getTreeItem(element: tree_item): vscode.TreeItem|Thenable<vscode.TreeItem>
        {
            const item = new vscode.TreeItem(element.label!, element.collapsibleState);
            return item;
        }
    
        public getChildren(element : tree_item | undefined): vscode.ProviderResult<tree_item[]> 
        {
            if (element === undefined) {
                return this.m_data;
            } else {
                return element.children;
            }
        }


    
        public item_clicked(item: tree_item)
        {
            
        }
    
        public refresh()
        {
            // TODO: error/notification no workspace folder opened...
            if (vscode.workspace.workspaceFolders) {
                this.m_data = [];
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
                this.m_onDidChangeTreeData.fire(undefined);
            } 
        }

        private read_directory(dir: string)
        {
            fs.readdirSync(dir).forEach(file => {
                let current = path.join(dir,file);
                if (fs.statSync(current).isFile())
                {
                    if(current.endsWith('.feature')) {
                        this.parse_feature_file(current);
                    } 
                } else {
                    this.read_directory(current)
                }
            });
        }

        private parse_feature_file(file: string)
        {
            const regex_feature = new RegExp("(?<=Feature:).*");
            const regex_scenario = new RegExp("(?<=Scenario:).*");
            let reader = rd.createInterface(fs.createReadStream(file))
            
            // TODO check if  i++ instead of ++i
            const line_counter = ((i = 0) => () => ++i)();

            reader.on("line", (line : string, line_number : number = line_counter()) => {

                let is_feature = line.match(regex_feature);
                if (is_feature) {
                    this.m_data.push(new tree_item(is_feature[0], file, line_number));
                }
                let is_scenario = line.match(regex_scenario);
                if (is_scenario) {
                    this.m_data.at(-1)?.children.push(new tree_item(is_scenario[0], file, line_number));
                    this.m_data.at(-1)?.make_collapsible();
                }
            });
        }
    }
}
