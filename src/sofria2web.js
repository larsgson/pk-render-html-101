const {renderers} = require('./render2html');

const defaultSettings = {
    showWordAtts: false,
    showTitles: true,
    showHeadings: true,
    showFootnotes: true,
    showXrefs: true,
    showChapterLabels: true,
    showVersesLabels: true,
    showCharacterMarkup: true,
    showParaStyles: true,
}

const sofria2WebActions = {
    startDocument: [
        {
            description: "Set up",
            test: () => true,
            action: ({config, workspace, output}) => {
                workspace.settings = {...defaultSettings, ...config}
                workspace.webParas = [];
                output.sofria = {};
                output.sofria.sequence = {};
                workspace.currentSequence = output.sofria.sequence;
                workspace.paraContentStack = [];
                workspace.footnoteNo = 1;
            },
        }
    ],
    startSequence: [
        {
            description: "identity",
            test: () => true,
            action: ({context, workspace}) => {
                workspace.currentSequence.type = context.sequences[0].type;
                workspace.currentSequence.blocks = [];
            }
        },
    ],
    endSequence: [
        {
            description: "identity",
            test: () => true,
            action: ({workspace}) => {
                if (workspace.currentSequence.type === 'footnote') {
                    workspace.footnoteNo++;
                }
                workspace.currentSequence = null;
            }
        },
    ],
    blockGraft: [
        {
            description: "Process block grafts",
            test: () => true,
            action: (environment) => {
                const currentBlock = environment.context.sequences[0].block;
                if (
                    currentBlock.subType !== "remark" &&
                    !(["title", "endTitle"].includes(currentBlock.subType) && !environment.workspace.settings.showTitles) &&
                    !(["heading"].includes(currentBlock.subType) && !environment.workspace.settings.showHeadings) &&
                    !(["introduction"].includes(currentBlock.subType) && !environment.workspace.settings.showIntroductions)
                ) {
                    const graftRecord = {
                        type: currentBlock.type,
                    };
                    if (currentBlock.sequence) {
                        graftRecord.sequence = {};
                        const cachedSequencePointer = environment.workspace.currentSequence;
                        environment.workspace.currentSequence = graftRecord.sequence;
                        const cachedParaContentStack = environment.workspace.paraContentStack;
                        environment.context.renderer.renderSequence(environment);
                        environment.workspace.paraContentStack = cachedParaContentStack;
                        environment.workspace.currentSequence = cachedSequencePointer;
                    }
                    environment.workspace.currentSequence.blocks.push(graftRecord);
                }
            }
        },
    ],
    inlineGraft: [
        {
            description: "identity",
            test: ({context, workspace}) => context.sequences[0].element.subType !== "note_caller" &&
                !(["footnote"].includes(context.sequences[0].element.subType) && !workspace.settings.showFootnotes) &&
                !(["xref"].includes(context.sequences[0].element.subType) && !workspace.settings.showXrefs),
                action: (environment) => {
                const element = environment.context.sequences[0].element;
                const graftRecord = {
                    type: element.type,
                };
                if (element.sequence) {
                    graftRecord.sequence = {};
                    const cachedSequencePointer = environment.workspace.currentSequence;
                    const cachedParaContentStack = [...environment.workspace.paraContentStack];
                    const cachedWebParas = environment.workspace.webParas;
                    environment.workspace.webParas = [];
                    environment.workspace.currentSequence = graftRecord.sequence;
                    environment.context.renderer.renderSequence(environment);
                    const sequencePseudoParas = environment.workspace.webParas;
                    environment.workspace.webParas = cachedWebParas;
                    environment.workspace.paraContentStack = cachedParaContentStack;
                    environment.workspace.paraContentStack[0].content.push(sequencePseudoParas);
                    environment.workspace.currentSequence = cachedSequencePointer;
                }
            }
        },
    ],
    startParagraph: [
        {
            description: "Initialise content stack",
            test: () => true,
            action: ({context, workspace}) => {
                const block = context.sequences[0].block;
                workspace.paraContentStack = [
                    {
                        subType: block.subType,
                        content: []
                    }
                ]
            }
        },
    ],
    endParagraph: [
        {
            description: "Add completed para to webParas",
            test: () => true,
            action: ({context, workspace}) => {
                workspace.webParas.push(
                    renderers.paragraph(
                        workspace.settings.showParaStyles || ['footnote', 'xref'].includes(context.sequences[0].type) ?
                            workspace.paraContentStack[0].subType :
                            "usfm:m",
                        workspace.paraContentStack[0].content,
                        workspace.footnoteNo,
                    )
                );
            }
        },
    ],
    startWrapper: [
        {
            description: "Skip usfm:w outside main sequence",
            test: ({context}) => context.sequences[0].element.subType === "usfm:w" && context.sequences[0].type !== "main",
            action: () => {}
        },
        {
            description: "Handle standard w attributes",
            test: ({context}) => context.sequences[0].element.subType === "usfm:w",
            action: ({context, workspace}) => {
                const atts = context.sequences[0].element.atts;
                const standardAtts = {};
                for (const [key, value] of Object.entries(atts)) {
                    if (["strong", "lemma", "gloss"].includes(key)) {
                        standardAtts[key] = value;
                    }
                }
                workspace.paraContentStack.unshift(
                    {
                        atts: standardAtts,
                        content: []
                    }
                );
                return false;
            }
        },
        {
            description: "Push to paraContent Stack",
            test: ({context, workspace}) => !["chapter", "verses"].includes(context.sequences[0].element.subType) && workspace.settings.showCharacterMarkup,
            action: ({context, workspace}) => {
                const pushed = {
                    subType: context.sequences[0].element.subType,
                    content: []
                };
                workspace.paraContentStack.unshift(
                    pushed
                );
            }
        },
    ],
    endWrapper: [
        {
            description: "Skip usfm:w outside main sequence",
            test: ({context}) => context.sequences[0].element.subType === "usfm:w" && context.sequences[0].type !== "main",
            action: () => {}
        },
        {
            description: "Handle standard w attributes",
            test: ({context}) => context.sequences[0].element.subType === "usfm:w",
            action: ({workspace}) => {
                const popped = workspace.paraContentStack.shift();
                    workspace.paraContentStack[0].content.push(renderers.wWrapper(
                        (workspace.settings.showWordAtts ? popped.atts : {}),
                        popped.content
                    ));
                return false;
            }
        },
        {
            description: "Collapse one level of paraContent Stack",
            test: ({context, workspace}) => !["chapter", "verses"].includes(context.sequences[0].element.subType) && workspace.settings.showCharacterMarkup,
            action: ({workspace}) => {
                const popped = workspace.paraContentStack.shift();
                workspace.paraContentStack[0].content.push(renderers.wrapper(popped.subType, popped.content));
            }
        },
    ],
    startMilestone: [
        {
            description: "Handle zaln word-like atts",
            test: ({context}) => context.sequences[0].element.subType === "usfm:zaln",
            action: ({context, workspace}) => {
                const atts = context.sequences[0].element.atts;
                const standardAtts = {};
                for (const [key, value] of Object.entries(atts)) {
                    if (["x-strong", "x-lemma", "x-morph", "x-content"].includes(key)) {
                        standardAtts[key.split('-')[1]] = value;
                    }
                }
                workspace.paraContentStack.unshift(
                    {
                        atts: standardAtts,
                        content: []
                    }
                );
                return false;
            }
        },
    ],
    endMilestone: [
        {
            description: "Handle zaln word-like atts",
            test: ({context}) => context.sequences[0].element.subType === "usfm:zaln",
            action: ({workspace}) => {
                const popped = workspace.paraContentStack.shift();
                workspace.paraContentStack[0].content.push(renderers.wWrapper(
                    (workspace.settings.showWordAtts ? popped.atts : {}),
                    popped.content
                ));
                return false;
            }
        },
    ],
    text: [
        {
            description: "Push text to para",
            test: () => true,
            action: ({context, workspace}) => {
                const element = context.sequences[0].element;
                workspace.paraContentStack[0].content.push(renderers.text(element.text));
            }
        },
    ],
    mark: [
        {
            description: "Show chapter/verse markers",
            test: () => true,
            action: ({context, workspace}) => {
                const element = context.sequences[0].element;
                if (element.subType === "chapter_label" && workspace.settings.showChapterLabels) {
                    workspace.paraContentStack[0].content.push(renderers.chapter_label(element.atts.number));
                } else if (element.subType === "verses_label" && workspace.settings.showVersesLabels) {
                    workspace.paraContentStack[0].content.push(renderers.verses_label(element.atts.number));
                }
            }
        },
    ],
    endDocument: [
        {
            description: "Build JSX",
            test: () => true,
            action: ({workspace, output}) => {
                output.paras = renderers.mergeParas(workspace.webParas);
            }
        }
    ],
};

module.exports = sofria2WebActions;
