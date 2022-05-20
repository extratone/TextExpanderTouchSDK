
var editorDelegate = {
    
snippetLabelChanged: function(labelText) {
    window.webkit.messageHandlers.snippetLabelChanged.postMessage(labelText);
},
    snippetAbbreviationChanged: function(abbreviationText) {
        window.webkit.messageHandlers.snippetAbbreviationChanged.postMessage(abbreviationText);
},
    
    snippetAbbreviationCaseChanged: function(abbreviationCase) {
    window.webkit.messageHandlers.snippetAbbreviationCaseChanged.postMessage(abbreviationCase);
},
    snippetContentTextChanged: function(snippetContentText) {
        window.webkit.messageHandlers.snippetContentTextChanged.postMessage(snippetContentText);
},
    snippetContentTypeChanged: function(snippetContentType) {
        window.webkit.messageHandlers.snippetContentTypeChanged.postMessage(snippetContentType);
},
    editorFocus: function(dummyParameter) {
            window.webkit.messageHandlers.editorFocus.postMessage(dummyParameter);
},
};

var fillinDelegate = {
snippetFillinStatusChanged: function(snippetContent) {
    window.webkit.messageHandlers.snippetFillinStatusChanged.postMessage(snippetContent);
},
}

var editorLogDelegate = {
editorLog: function(message) {
    window.webkit.messageHandlers.editorLog.postMessage(message);
},
}

setFillinDelegate(fillinDelegate);
setEditorDelegate(editorDelegate);
setEditorLogDelegate(editorLogDelegate);
disableImageImport();
disableSpecialCharacterDropdown();