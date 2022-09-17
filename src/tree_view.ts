import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
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

    
    interface debug_config {
        type: string;
        name: string;
        program: string|undefined;
        command: string;
        cwd: string;
    }

    class tree_item extends vscode.TreeItem {
        readonly file: string;
        readonly line: line;
        readonly is_scenario: boolean;
        readonly children: tree_item[] = [];

        constructor(label: string, file: string, line: line, is_scenario: boolean) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.file = file;
            this.line = line;
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.is_scenario = is_scenario;
            this.set_icon("");
        }

        public add_child (child : tree_item) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }

        public set_icon(icon_file: string) {
            console.log(path.join(__filename, '..', '..', 'src', 'assets', icon_file));
            this.iconPath = {
                light: path.join(__filename, '..', '..', 'src', 'assets', icon_file),
                dark: path.join(__filename, '..', '..', 'src', 'assets', icon_file)
            };
        }
    }

    class cucumber {
        private cwd: string;
        private args: string[] = [];
        private command: string; 
        private program: string|undefined;

        public reload_tree: () => void;

        private readonly regex_feature = new RegExp("Failing Scenarios:");

        constructor(features: string|undefined, reload_tree : () => void){
            if (vscode.workspace.workspaceFolders) {

                this.reload_tree = reload_tree;

                const configs = vscode.workspace.getConfiguration("launch").get("configurations") as Array<debug_config>;
                const cfg = configs[0];     
                const wspace_folder = vscode.workspace.workspaceFolders[0].uri.fsPath;

                this.cwd = cfg.cwd === undefined ?  wspace_folder : cfg.cwd.replace("${workspaceFolder}", wspace_folder);
                this.program = cfg.program === undefined ? undefined : cfg.program.replace("${workspaceFolder}", wspace_folder);
                this.command = cfg.command === undefined ? 'cucumber' : cfg.command;

                if (features === undefined) {
                    this.args.push(JSON.stringify(this.cwd + "/features"));
                } else {
                    this.args.push(JSON.stringify(features));
                }
            } else {
                throw new Error("can't execute cucumber, no workspace folder is opened!");
            }
        }

        public run_tests(tree_data: tree_view_data, ) {
                if (this.program === undefined){
                    this.execute_cucumber(tree_data);
                } else {
                    var runner = spawn(this.program, {detached: false});
                    runner.on('spawn', () => {
                        console.log(this.program + ' started!');
                        this.execute_cucumber(tree_data);
                    });
                    runner.on('exit', (code) => {
                        console.log(this.program + ' exited with code ' + code);
                    });
                }

        }

        private execute_cucumber(tree_data: tree_view_data) {
            var runner = spawn(this.command , this.args , {detached: false, shell: true, cwd: this.cwd});
			runner.stdout.on('data', data => {
                console.log(data.toString());
                tree_data.get_item_by_file_and_row(data.toString());
            });
            runner.stderr.on('data', data => {
                console.log(data.toString());
            });
            runner.on('exit', (code) => {
				console.log(this.command + ' exited with code ' + code);
			});
        }
    }
    
    class tree_view_data {
        private data : tree_item [] = [];
        private readonly regex_file_and_row = new RegExp("(features*.+\\w+\\.feature)\\:(\\d+)");

        public add_item(item: tree_item) {
            this.data.push(item);
        }

        public get_data() {
            return this.data;
        }

        // TODO Refactor
        public get_item_by_file_and_row(line : string){
            var current = line.match(this.regex_file_and_row);
            if (current) {
                console.log(current);
                var row =  Number(current![2]);
                var file = current![1].toString();
                this.data.forEach((feature) => {
                    var result = feature.children.find(item => 
                        item.line.row === row && path.normalize(item.file).includes(path.normalize(file))
                    );
                    if (result !== undefined) {
                        result.set_icon("passed.png"); 
                    }
                });
            }
        }

        public erase_data() {
            this.data = [];
        }

        public at(index: number){
            return this.data.at(index);
        }
    }

    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        private data : tree_view_data = new tree_view_data();
        private event_emitter: vscode.EventEmitter<tree_item | undefined> = new vscode.EventEmitter<tree_item | undefined>();

        readonly onDidChangeTreeData ? : vscode.Event<tree_item | undefined> = this.event_emitter.event;
   
        private readonly regex_feature = new RegExp("(?<=Feature:).*");
        private readonly regex_scenario = new RegExp("(?<=Scenario:).*");
        private readonly regex_scenario_outline = new RegExp("(?<=Scenario Outline:).*");

        public constructor()  {
            vscode.commands.registerCommand('cwt_cucumber.on_item_clicked', item => this.on_item_clicked(item));
            vscode.commands.registerCommand('cwt_cucumber.refresh', () => this.refresh());
            vscode.commands.registerCommand('cwt_cucumber.run', () => this.run_all_tests());
            vscode.commands.registerCommand('cwt_cucumber.context_menu_run', item => this.run_tree_item(item));
        }

        public getTreeItem(item: tree_item): vscode.TreeItem|Thenable<vscode.TreeItem> {
            var title = item.label ? item.label.toString() : "";
            var result = new vscode.TreeItem(title, item.collapsibleState);
            result.command = { command: 'cwt_cucumber.on_item_clicked', title : title, arguments: [item] };
            result.iconPath = item.iconPath;
            return result;
        }
    
        public getChildren(element : tree_item | undefined): vscode.ProviderResult<tree_item[]> {
            return (element === undefined) ? this.data.get_data() : element.children;
        }

        public on_item_clicked(item: tree_item) {
            if (item.file === undefined) return;
            vscode.workspace.openTextDocument(item.file).then( document => {
                vscode.window.showTextDocument(document).then( editor => {
                        var pos = new vscode.Position(item.line.row, item.line.length);
                        editor.selection = new vscode.Selection(pos, pos);
                        editor.revealRange(new vscode.Range(pos, pos));
                    }
                );
            });
        }
    
        public refresh() {
            if (vscode.workspace.workspaceFolders) {
                this.data.erase_data();
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
                this.reload_tree_data();
            } else {
                throw new Error("can't refresh tree view, no workspace folder is opened!");
            }
        }

        public reload_tree_data() {
            console.log('******updating tree!!!!');
            this.event_emitter.fire(undefined);
        }

        private run_all_tests() {
            this.internal_run(undefined);
        }

        private run_tree_item(item: tree_item) {
            var feature = item.file;
            if (item.is_scenario) {
                feature += ':' + item.line.row;
            }
            this.internal_run(feature);
        }

        private internal_run(feature: string|undefined) {
            var cucumber_runner = new cucumber(feature, this.reload_tree_data);
            cucumber_runner.run_tests(this.data);
            this.reload_tree_data();
        }



        private read_directory(dir: string) {
            fs.readdirSync(dir).forEach(file => {
                var current = path.join(dir,file);
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

            var reader = rd.createInterface(fs.createReadStream(file))
            const line_counter = ((i = 1) => () => i++)();

            reader.on("line", (current_line : string, line_number : number = line_counter()) => {
                var is_feature = current_line.match(this.regex_feature);
                if (is_feature) {
                    this.data.add_item(new tree_item(is_feature[0], file, new line(current_line, line_number), false));
                }
                var is_scenario = current_line.match(this.regex_scenario);
                if (is_scenario) {
                    this.data.at(-1)?.add_child(new tree_item(is_scenario[0], file, new line(current_line, line_number), true));
                }
                var is_scenario_outline = current_line.match(this.regex_scenario_outline);
                if (is_scenario_outline) {
                    this.data.at(-1)?.add_child(new tree_item(is_scenario_outline[0], file, new line(current_line, line_number), true));
                }
            });
        }
    }
}
