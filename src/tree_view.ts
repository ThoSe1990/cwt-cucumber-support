
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export namespace cwt
{
    class tree_item extends vscode.TreeItem 
    {
        file: string | undefined;
        line: number | undefined;

        children: tree_item[] | undefined;

        constructor(label: string, children?: tree_item[], file?: string, line?: number) {
            super(
                label,
                children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded
            );
            this.children = children;
            this.file = file;
            this.line = line;

            console.log('creating item:'+label+' '+file+':'+line);

          }
    }
    
    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        private m_data : tree_item [] = [];
        private m_onDidChangeTreeData: vscode.EventEmitter<tree_item | undefined> = new vscode.EventEmitter<tree_item | undefined>();
        readonly onDidChangeTreeData ? : vscode.Event<tree_item | undefined> = this.m_onDidChangeTreeData.event;

        public constructor() 
        {
            if (vscode.workspace.workspaceFolders) {
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
            } 
            vscode.window.showInformationMessage('created tree!');
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
            this.m_data = [];
            if (vscode.workspace.workspaceFolders) {
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
            } 
            this.m_onDidChangeTreeData.fire(undefined);
        }

        private read_directory(dir: string)
        {
            fs.readdirSync(dir).forEach(file => {
                let current = path.join(dir,file);
                if (fs.statSync(current).isFile())
                {
                    if(current.endsWith('.feature')) {
                        console.log(current);
                        this.parse_feature_file(current);
                    } 
                } else {
                    this.read_directory(current)
                }
            });
        }

        private add_tree_item(item : tree_item)
        {
            this.m_data.push(item);
        }

        private parse_feature_file(file: string)
        {
            let content = fs.readFileSync(file, 'utf-8').toString().split('\n');
            let regex_feature = new RegExp("(?<=Feature:).*");
        			
            for (let i = 0; i < content.length; i++) {
                var feature = content[i].match(regex_feature);
                if (feature) {
                    this.m_data.push(new tree_item(feature[0], undefined, file, i));
                }
            }	
        }



    }
    


}
