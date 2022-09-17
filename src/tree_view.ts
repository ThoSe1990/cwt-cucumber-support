
import { ConsoleReporter } from '@vscode/test-electron';
import { exec, spawn } from 'child_process';
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

    class cucumber {
        private cwd: string;
        private args: string[] = [];
        private command: string; 
        private program: string|undefined;

        constructor(cwd: string, scenario: string|undefined, command: string, program: string|undefined){
            if (vscode.workspace.workspaceFolders) {
                const wspace_folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                this.cwd = cwd === undefined ?  wspace_folder : cwd.replace("${workspaceFolder}", wspace_folder);
                this.args.push(JSON.stringify(this.cwd + "/features"));
                if (scenario != undefined) {
                    this.args.push("--name");
                    this.args.push(JSON.stringify(scenario.trim()));
                }
                this.command = command === undefined ? 'cucumber' : command;
                this.program = program === undefined ? undefined : program.replace("${workspaceFolder}", wspace_folder);
            } else {
                throw new Error("can't execute cucumber, no workspace folder is opened!");
            }

        }

        public run_tests(){
            console.log('given args:');
            console.log(this.args);
            if (this.program === undefined){
                this.execute_cucumber();
            } else {
                var runner = spawn(this.program, {detached: false});
                runner.on('spawn', () => {
                    console.log(this.program + ' started!');
                    this.execute_cucumber();
                });
                runner.on('exit', (code) => {
                    console.log(this.program + ' exited with code ' + code);
                });
            }
        }

        private execute_cucumber() {
            var runner = spawn(this.command , this.args , {detached: false, shell: true, cwd: this.cwd});
			runner.stdout.on('data', data => {
                console.log(data.toString());
			});
            runner.stderr.on('data', data => {
                console.log(data.toString());
            });
            runner.on('exit', (code) => {
				console.log(`QQ Child exited with code ${code}`);
			});
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
            vscode.commands.registerCommand('cwt_cucumber.run', () => this.run(undefined));

            vscode.commands.registerCommand('cwt_cucumber.context_menu_command_0', item => {
                console.log('running:');
                console.log(item.label);
                console.log(item.line);
                this.run(item.label.toString());
            });
            // vscode.commands.registerCommand('cwt_cucumber.context_menu_command_0', item => this.command_0(item));
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
            if (vscode.workspace.workspaceFolders) {
                this.data = [];
                this.read_directory(vscode.workspace.workspaceFolders[0].uri.fsPath);
                this.event_emitter.fire(undefined);
            } else {
                throw new Error("can't refresh tree view, no workspace folder is opened!");
            }

        }

        public run(scenario: undefined|string) {
            if (vscode.workspace.workspaceFolders) {
                const configs = vscode.workspace.getConfiguration("launch").get("configurations") as Array<debug_config>;
                const cfg = configs[0];                
                var cucumber_runner = new cucumber(cfg.cwd, scenario, cfg.command, cfg.program);
                cucumber_runner.run_tests();
            } else {
                throw new Error("can't execute cucumber, no workspace folder is opened!");
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
            const line_counter = ((i = 1) => () => i++)();

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
