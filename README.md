# CWT Cucumber Support

Let's create a tree view with vscode in TypeScript. In this project I'll start to implement a vscode extension which displays all your cucumber features and scenarios in a tree view.
  
On my blog you can find the articles to this repository:
-  <a href="https://www.codingwiththomas.com/blog/typescript-vs-code-api-lets-create-a-tree-view-part-1" target="_blank">VS-Code API: Let’s Create A Tree-View (Part 1)</a> 
-  <a href="https://www.codingwiththomas.com/blog/typescript-vs-code-api-lets-create-a-tree-view-part-2" target="_blank">VS-Code API: Let’s Create A Tree-View (Part 2)</a> 


## Part 1
In the first article, the extention parses only feature files and creates a menu entry at the navigation bar: 

![tree view example](img/tree_view.png)


## Part 2 
Here I implemented `on_item_clicked(..)` to jump to the corresponding file and added a context menu to the tree view. There is no logic on the functions implemented yet, only two different logs, that we can see the functions are called accordingly. 

![context menu example](img/context_menu.png)
