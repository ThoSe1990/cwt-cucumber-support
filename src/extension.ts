import * as vscode from 'vscode';
import { cwt } from './tree_view';

export function activate(context: vscode.ExtensionContext) 
{
	let tree = new cwt.tree_view();
	vscode.window.registerTreeDataProvider('cwt_cucumber', tree);
}

export function deactivate() {}
