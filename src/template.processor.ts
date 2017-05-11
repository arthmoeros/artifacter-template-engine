import { StringContainer } from "@artifacter/common";

import { MappedExpression } from "./entity/mapped-expression";
import { DeclaredIteration } from "./entity/declared-iteration";
import { TemplateContainer } from "./container/template.container";
import { PipeFunctionsProcessor } from "./pipe-functions.processor";
import { TemplateFunctionsProcessor } from "./template-functions.processor";

const subTmplReged = new RegExp(/(::)*([a-zA-Z0-9_./]*?)*(::)/g);
/**
 * @class TemplateProcessor
 * @see npm @artifacter/template-engine
 * @see also README.md of this project for an explanation about atmpl files
 * @author arthmoeros (Arturo Saavedra) artu.saavedra@gmail.com
 * 
 * This is the main class for template processing, it uses a Map<string, string> to process the template
 * into a filled artifact with its data.
 * 
 */
export class TemplateProcessor {

	/**
	 * Associated TemplateContainer
	 */
	private atmplContainer: TemplateContainer;

	/**
	 * Added template parameters for parameterized expressions
	 */
	private templateParameters: any;

	/**
	 * PipeFunctions processor
	 */
	private pipeFunctionsProcessor: PipeFunctionsProcessor;

	/**
	 * TemplateFunctionsProcessor processor
	 */
	private tmplFunctionsProcessor: TemplateFunctionsProcessor;

	/**
	 * Constructs a Template Processor with an anonymous template
	 * @param stringTmpl string containing template contents
	 * @param optionalityByDefault makes all mapped expressions optional by default
	 */
	constructor(stringTmpl: string, optionalityByDefault?: boolean);

	/**
	 * Construct a Templater Processor with an atmpl file and optional custom pipe functions and custom template functions
	 * @param fileName atmpl file name
	 * @param fileBuffer atmpl Buffer with atmpl contents
	 * @param customPipeFunctions Custom Pipe Functions to use, it must contain methods annotated with @PipeFunction
	 * @param customTmplFunctions Custom Template Functions to use, it must contain methods annotated with @TemplateFunction
	 */
	constructor(fileName: string, fileBuffer: Buffer, customPipeFunctions?: any, customTmplFunctions?: any);

	constructor(param1: string, param2: Buffer | boolean, customPipeFunctions?: any, customTmplFunctions?: any) {
		if (param2 instanceof Buffer) {
			this.atmplContainer = new TemplateContainer(param1, param2);
		} else {
			this.atmplContainer = new TemplateContainer(param1, param2);
		}
		this.pipeFunctionsProcessor = new PipeFunctionsProcessor(customPipeFunctions);
		this.tmplFunctionsProcessor = new TemplateFunctionsProcessor(customTmplFunctions);
	}

	/**
	 * Sets up Template Parameters for use with parameterized expressions, if the processed
	 * template has parameterized expressions, these parameters must be set before the 
	 * processor is run, otherwise it will raise an error
	 */
	public setTemplateParameters(templateParameters: any){
		this.templateParameters = templateParameters;
	}

	/**
	 * Runs the processor, checks if atmpl is invalid or if the map is empty.
	 * This process puts the map's values into the mapped expressions following their defined 
	 * instructions.
	 * It will emit a warning if a map value from a non-optional mapped expression's mappedKey 
	 * is not found, resulting in a potential invalid generated artifact.
	 * 
	 * @param map map containing the data to put into mapped expressions
	 */
	public run(map: Map<string, string>): string {
		if(this.atmplContainer.$skip){
			return this.atmplContainer.$fileContents;
		}
		if (this.atmplContainer.$invalid) {
			throw new Error(TemplateContainer.msgTmplInvalid);
		}
		if (map.size == 0) {
			throw new Error("Invalid Values Map: map is empty");
		}
		let workingResult: StringContainer = new StringContainer(this.atmplContainer.$fileContents);
		for (var index = (this.atmplContainer.$mapExprList.length - 1); index > -1; index--) {
			var mapExpr = this.atmplContainer.$mapExprList[index];
			if (mapExpr.$isIterated) {
				workingResult.replaceRange(mapExpr.$startIndex, mapExpr.$endIndex, this.retrieveValueFromIterDec(mapExpr.$mappedKey));;
			} else if (mapExpr.$isParameterized) {
				if(this.templateParameters == null){
					throw new Error("Invalid Processor state: found Parameterized Expression, but no template parameters are set");
				}else if(this.templateParameters[mapExpr.$mappedKey] == null){
					console.warn("Expected parameter name '" + mapExpr.$mappedKey + "', but provided template parameters doesn't have a value associated with it, expect an invalid generated artifact from template located in '" + this.atmplContainer.$filename + "'");
				}else{
					workingResult.replaceRange(mapExpr.$startIndex, mapExpr.$endIndex, this.templateParameters[mapExpr.$mappedKey]);;
				}
			} else {
				let mappedValue: string = map.get(mapExpr.$mappedKey);
				if (mappedValue == undefined && !mapExpr.$isOptional && !this.atmplContainer.$optionalityByDefault) {
					console.warn("Expected key '" + mapExpr.$mappedKey + "', but provided map doesn't have a value associated with it, expect an invalid generated artifact from template located in '" + this.atmplContainer.$filename + "' or maybe you should set the Mapped Expression as optional");
				} else if (mappedValue == undefined && (mapExpr.$isOptional || this.atmplContainer.$optionalityByDefault)) {
					workingResult.replaceRange(mapExpr.$startIndex, mapExpr.$endIndex, "");
				} else {
					if (mapExpr.$isTernary) {
						mappedValue = mappedValue != "" ? mapExpr.$ternaryTrue : mapExpr.$ternaryFalse ? mapExpr.$ternaryFalse : "";
					}
					if (mapExpr.$pipeFunctions && mapExpr.$pipeFunctions.length > 0) {
						mappedValue = this.pipeFunctionsProcessor.invoke(mapExpr.$pipeFunctions, mappedValue);
					}
					workingResult.replaceRange(mapExpr.$startIndex, mapExpr.$endIndex, mappedValue);
				}
			}
		}
		let iterDecRegex: RegExp = new RegExp(DeclaredIteration.regex);
		workingResult.replace(iterDecRegex, "");

		return workingResult.toString();
	}

	/**
	 * Invokes the associated mapped function with the iterated mapped expression
	 * @param mappedKey iterated mapped expression's mappedKey to process with Declared Iteration
	 */
	private retrieveValueFromIterDec(mappedKey: string): string {
		let result: string;
		this.atmplContainer.$iterDecList.forEach(iterDec => {
			if (iterDec.$mappedKey == mappedKey) {
				result = this.tmplFunctionsProcessor.invoke(iterDec.$mappedFunction);
				return;
			}
		});
		return result;
	}

	/**
	 * Utility static method for boolean evaluation of a single MappedExpression with a corresponding map.
	 * It will return true only if the value found from the mappedKey and is "true" or "1", otherwise
	 * it returns false
	 * @param expression String containing a single MappedExpression
	 * @param map values map to use for processing
	 */
	public static evaluateBoolean(expression: string, map: Map<string, string>): boolean {
		const mapExpRegex = new RegExp(MappedExpression.regex);
		let result: RegExpExecArray = mapExpRegex.exec(expression);
		if (mapExpRegex.lastIndex == 0) {
			throw new Error("Invalid expression '" + expression + "' found trying to evaluate a boolean");
		}
		let expr: MappedExpression = new MappedExpression(result);
		let value: string = map.get(expr.$mappedKey);
		if (value) {
			return expr.$isNegated ?
				!(value.toLowerCase() == "true" || value.toLowerCase() == "1") :
				(value.toLowerCase() == "true" || value.toLowerCase() == "1");
		} else {
			return false;
		}
	}

}