import * as tss from "typescript/lib/tsserverlibrary";

function init() {
  function create(info: tss.server.PluginCreateInfo): tss.LanguageService {
    const logger = (msg: string) =>
      info.project.projectService.logger.info(`[typescript-rxjs-inspection-plugin] ${msg}`);
    const { languageService: typescriptLanguageService } = info;

    logger("typescript-rxjs-inspection-plugin loaded");

    return {
      ...typescriptLanguageService,
      getApplicableRefactors: (fileName, positionOrRange, preferences, triggerReason) => {
        logger("getApplicableRefactors");
        return [
          { actions: [], description: "rxjs-inspection", name: "rxjs-inspection" },
          ...typescriptLanguageService.getApplicableRefactors(fileName, positionOrRange, preferences, triggerReason),
        ];
      },
    };
  }

  return { create };
}

export = init;
