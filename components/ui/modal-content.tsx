"use client";

import { createContext, Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { displayText } from "@/lib/display-text";

export const ModalDisplayContext = createContext(false);

/** Normalize display text across every shared dialog, preserving data, events,
 * component keys and controlled values. No DOM rewriting or API data mutation. */
export function readableModalContent(children:ReactNode):ReactNode {
  return Children.map(children,child=>{
    if(typeof child==="string")return displayText(child);
    if(!isValidElement(child))return child;
    const element=child as ReactElement<Record<string,unknown>>;
    const props=element.props;
    // Identifiers and editable/source text retain their original representation.
    if(props["data-verbatim"] || typeof props.className==="string"&&/(?:^|\s)mono(?:\s|$)/.test(props.className)
      || typeof element.type==="string"&&["input","textarea","code","pre","samp","kbd","script","style"].includes(element.type))return child;
    const next:Record<string,unknown>={};
    if("children" in props)next.children=readableModalContent(props.children as ReactNode);
    for(const key of ["title","subtitle","aria-label"]){if(typeof props[key]==="string")next[key]=displayText(props[key]);}
    return cloneElement(element,next);
  });
}
