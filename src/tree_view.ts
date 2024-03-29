import { spawn } from 'child_process';
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
        cwd: string;
    }


    enum test_result {
        none,
        passed,
        undefined,
        failed
    }

    class tree_item extends vscode.TreeItem {

        readonly file: string;
        readonly line: line;
        readonly is_scenario: boolean;
        readonly children: tree_item[] = [];

        private result: test_result = test_result.none;

        constructor(label: string, file: string, line: line, is_scenario: boolean) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.file = file;
            this.line = line;
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.is_scenario = is_scenario;
        }

        public add_child (child : tree_item) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }

        public set_test_result(result: test_result) {
            this.result = result;
            var icon = this.get_icon(result);
            this.iconPath = {
                light: path.join(__filename, '..', '..', 'src', 'assets', icon),
                dark: path.join(__filename, '..', '..', 'src', 'assets', icon)
            };
        }

        public get_last_result() {
            return this.result;
        }

        private get_icon(result: test_result) {
            switch (result) {
                case test_result.passed:
                    return 'passed.png';
                case test_result.failed:
                    return 'failed.png';
                case test_result.undefined:
                    return 'undefined.png';
                default:
                    return '';
            }
        }
    }

    interface cucumber_results {
        id: string;
        uri: string;
        elements: [{
            line: number;
            name: string;
            steps: [{
                result: {
                    status: string;
                }
            }]
        }]
    }

    class cucumber {
        private cwd: string;
        private args: string[] = [];
        private program: string|undefined;
        private test_result : string = '';

        constructor(features: string|undefined){
            if (vscode.workspace.workspaceFolders) {
                const configs = vscode.workspace.getConfiguration("launch").get("configurations") as Array<debug_config>;
                const cfg = configs[0];     
                const wspace_folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                this.cwd = cfg.cwd === undefined ?  wspace_folder : cfg.cwd.replace("${workspaceFolder}", wspace_folder);
                this.program = cfg.program === undefined ? undefined : cfg.program.replace("${workspaceFolder}", wspace_folder);

                if (features === undefined) {
                    this.args.push(JSON.stringify(this.cwd + "/features"));
                } else {
                    this.args.push(JSON.stringify(features));
                }
                this.args.push(JSON.stringify('--publish-quiet'));
                this.args.push(JSON.stringify('--format'));
                this.args.push(JSON.stringify('json'));

            } else {
                throw new Error("can't execute cucumber, no workspace folder is opened!");
            }
        }

        public async run_tests() {
            vscode.window.showInformationMessage('Starting tests, please wait.');
            if (this.program === undefined) {
                throw new Error("can't execute cucumber, no test program defined in launch.json");
            } 
            await this.launch_program();
            return this.execute_cucumber();
        }

        public set_test_results(tree_data: tree_view_data) {
            var result = JSON.parse(this.test_result) as cucumber_results[];
            result.forEach((feature) => {
                feature.elements.forEach((scenario) => {
                    var result = test_result.passed;
                    scenario.steps.forEach((step) => {
                        switch (step.result.status) {
                            case 'failed':
                                result = test_result.failed;
                                break;
                            case 'undefined':
                                result = test_result.undefined
                                break;
                        }
                    });
                    tree_data.get_scenario_by_uri_and_row(feature.uri, scenario.line)?.set_test_result(result);
                });
            });
        }

        private launch_program() {
            var self = this;
            return new Promise(function (resolve, reject) {
                var runner = spawn(self.program!, {detached: false});
                runner.on('spawn', () => {
                    console.log(self.program + ' started!');
                    resolve(true);
                });
                runner.on('error', (code) =>{
                    console.log('error: ', code);
                    reject(code);
                });   
            });
        }

        private execute_cucumber() {
            var self = this;
            return new Promise(function (resolve, reject) {
                var runner = spawn('cucumber' , self.args , {detached: false, shell: true, cwd: self.cwd});
                runner.stdout.on('data', data => {
                    self.test_result = self.test_result.concat(data.toString());
                });
                runner.on('exit', (code) => {
                    console.log('cucumber exited with code ' + code);
                    resolve(code);
                });    
                runner.on('error', (code) => {
                    console.log('error: ' + code);
                    reject(code);
                })        
            });
        }
    }
    
    class tree_view_data {
        private data : tree_item [] = [];
        
        public add_item(item: tree_item) {
            this.data.push(item);
        }

        public get_data() {
            return this.data;
        }

        public update_feature_icons() {
            this.data.forEach((feature) => {
                feature.set_test_result(test_result.none);
                feature.children.forEach((scenario) => {
                    if (feature.get_last_result() !== test_result.failed) {   
                        switch (scenario.get_last_result()) {
                            case test_result.passed:
                                feature.set_test_result(test_result.passed);
                                break;
                            case test_result.failed:
                                feature.set_test_result(test_result.failed);
                                break;     
                            case test_result.undefined:
                                    feature.set_test_result(test_result.undefined);
                                    break;          
                            default:
                                feature.set_test_result(test_result.none);
                                break;
                        }
                    }
                });
            });
        }

        public get_feature_by_uri(uri : string) {
            return this.data.find((feature) =>  
                path.normalize(feature.file).includes(path.normalize(uri))
            );
        }

        public get_scenario_by_uri_and_row(uri: string, line_number: number){
            var feature = this.get_feature_by_uri(uri);
            if (feature) {
                return feature.children.find((scenario) => 
                    scenario.line.row === line_number 
                );
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

        readonly onDidChangeTreeData? : vscode.Event<tree_item | undefined> = this.event_emitter.event;
   
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
                        var pos = new vscode.Position(item.line.row-1, item.line.length);
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
            } 
        }

        public reload_tree_data() {
            this.data.update_feature_icons();
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
            var cucumber_runner = new cucumber(feature);
            cucumber_runner.run_tests().then(() => {
                cucumber_runner.set_test_results(this.data);
                this.reload_tree_data();
            });
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
