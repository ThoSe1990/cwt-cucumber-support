
import * as fs from 'fs';
import * as path from 'path';
import * as rd from 'readline';
import * as vscode from 'vscode';

export namespace cwt
{
    class line {
        readonly text : string;
        readonly row : number;
        readonly length : number;

        constructor (text : string, row : number ){
            this.text = text;
            this.length = text.length;
            this.row = row;
        }
    }

    class tree_item extends vscode.TreeItem {
        readonly file: string;
        readonly line: line;

        readonly children: tree_item[] = [];

        constructor(label: string, file: string, line: line) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.file = file;
            this.line = line;
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        public add_child (child : tree_item) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }
    }
    
    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        private data : tree_item [] = [];
        private event_emitter: vscode.EventEmitter<tree_item | undefined> = new vscode.EventEmitter<tree_item | undefined>();

        readonly onDidChangeTreeData ? : vscode.Event<tree_item | undefined> = this.event_emitter.event;
   
        private readonly regex_feature = new RegExp("(?<=Feature:).*");
        private readonly regex_scenario = new RegExp("(?<=Scenario:).*");
        private readonly regex_scenario_outline = new RegExp("(?<=Scenario Outline:).*");

        public constructor()  {
            vscode.commands.registerCommand('cwt_cucumber.on_item_clicked', item => this.on_item_clicked(item));
            vscode.commands.registerCommand('cwt_cucumber.refresh', () => this.refresh());

            vscode.commands.registerCommand('cwt_cucumber.context_menu_command_0', item => this.command_0(item));
            vscode.commands.registerCommand('cwt_cucumber.context_menu_command_1', item => this.command_1(item));

        }

        public command_0(item: tree_item) {
            console.log("context menu command 0 clickd with: ", item.label);
        }
        public command_1(item: tree_item) {
            console.log("context menu command 1 clickd with: ", item.label);
        }

        public getTreeItem(item: tree_item): vscode.TreeItem|Thenable<vscode.TreeItem> {
            let title = item.label ? item.label.toString() : "";
            let result = new vscode.TreeItem(title, item.collapsibleState);
            result.command = { command: 'cwt_cucumber.on_item_clicked', title : title, arguments: [item] };
            return result;
        }
    
        public getChildren(element : tree_item | undefined): vscode.ProviderResult<tree_item[]> {
            return (element === undefined) ? this.data : element.children;
        }

        public on_item_clicked(item: tree_item) {
            if (item.file === undefined) return;
            vscode.workspace.openTextDocument(item.file).then( document => {
                vscode.window.showTextDocument(document).then( editor => {
                        let pos = new vscode.Position(item.line.row, item.line.length);
                        editor.selection = new vscode.Selection(pos, pos);
                        editor.revealRange(new vscode.Range(pos, pos));
                    }
                );
            });
        }
    
        public refresh() {
            // TODO: error/notification no workspace folder opened...
            if (vscode.workspace.workspaceFolders) {
                this.data = [];
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
                this.event_emitter.fire(undefined);
            } 
        }

        private read_directory(dir: string) {
            fs.readdirSync(dir).forEach(file => {
                let current = path.join(dir,file);
                if (fs.statSync(current).isFile()) {
                    if(current.endsWith('.feature')) {
                        this.parse_feature_file(current);
                    } 
                } else {
                    this.read_directory(current)
                }
            });
        }

        private parse_feature_file(file: string) {

            let reader = rd.createInterface(fs.createReadStream(file))
            const line_counter = ((i = 0) => () => i++)();

            reader.on("line", (current_line : string, line_number : number = line_counter()) => {
                let is_feature = current_line.match(this.regex_feature);
                if (is_feature) {
                    this.data.push(new tree_item(is_feature[0], file, new line(current_line, line_number)));
                }
                let is_scenario = current_line.match(this.regex_scenario);
                if (is_scenario) {
                    this.data.at(-1)?.add_child(new tree_item(is_scenario[0], file, new line(current_line, line_number)));
                }
                let is_scenario_outline = current_line.match(this.regex_scenario_outline);
                if (is_scenario_outline) {
                    this.data.at(-1)?.add_child(new tree_item(is_scenario_outline[0], file, new line(current_line, line_number)));
                }
            });
        }
    }
}
