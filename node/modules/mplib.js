"use strict";

/**
 * Extends an option object,
 * @param object defaults
 * @param object newOptions
 * @return object with resulting options
 */
function extend( defaults, newOptions ) {
    var option,options = {};
    // Append defaults
    if (typeof defaults==="object") {
        for(option in defaults) {
            if (defaults.hasOwnProperty(option)) {
                options[option] = defaults[option];
            }
        }
    }
    // Overwrite defaults
    if (typeof newOptions==="object") {
        for(option in newOptions) {
            if (newOptions.hasOwnProperty(option)) {
                options[option] = newOptions[option];
            }
        }
    }
    // Return extended options
    return options;
}

module.exports.extend = extend;