
import * as vscode from 'vscode'
import * as path from 'path';
import * as fs from 'fs';

export namespace cwt
{
    class tree_item extends vscode.TreeItem 
    {
        children: tree_item[] | undefined;
    }
    
    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        m_data : tree_item [] = [];
    
        constructor() 
        {
            vscode.window.showInformationMessage('created tree!');
            vscode.commands.registerCommand('cwt_cucumber.item_clicked', r => this.item_clicked(r));
            vscode.commands.registerCommand('cwt_cucumber.refresh', () => this.refresh());
        }
    
        item_clicked(item: tree_item)
        {
            
        }
    
        refresh()
        {
            vscode.window.showInformationMessage('view refreshed!');
        }

        getTreeItem(element: tree_item): vscode.TreeItem|Thenable<vscode.TreeItem> {
            var title = element.label ? element.label.toString() : "";
            const treeItem = new vscode.TreeItem(element.label!, element.collapsibleState);
            treeItem.command = { command: 'cwt_cucumber_view.item_clicked', title: title, arguments: [element] };
            treeItem.iconPath = element.iconPath;
            return treeItem;
        }
    
        getChildren(element : tree_item | undefined): vscode.ProviderResult<tree_item[]> {
            if (element === undefined) {
                return this.m_data;
            }
            return element.children;
        }
    }
    


}
