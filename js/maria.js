
/**
 * xxxxxxxxx LOGARITHMIC TONE MAPPER xxxxxxxxxxx
 */

function LogarithmicTonemapper()
{
    if(this.constructor !== LogarithmicTonemapper)
        throw("Use new");

    this.uniforms = {
        //u_maxLum: renderer._uniforms['u_maxLum']
    };
}

LogarithmicTonemapper.Name = 'Logarithmic';

LogarithmicTonemapper.Uniforms = `

    uniform float u_maxLum;

    float log10( float x ) {

        const float invLog10 = 0.43429448190325176;
        return (invLog10) * log(x);
    }
`;    

LogarithmicTonemapper.Code = `

    float lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    float lum_TM = log10(1.0+lum)/log10(1.0+u_maxLum);

    color = color.rgb * lum_TM/lum;
`;

CORE.registerTonemapper( LogarithmicTonemapper );


/**
 * xxxxxxxxx EXPONENTIAL TONE MAPPER xxxxxxxxxxx
 */

function ExponentialTonemapper()
{
    if(this.constructor != ExponentialTonemapper)
        throw("Use new");

    this.uniforms = {};
    this.params = {
        'Brightness': {
            value: 0.35,
            options: {
                min: 0.01,
                max: 1.5,
                step: 0.1
            }
        }
    };
}

ExponentialTonemapper.Name = 'Exponential';

ExponentialTonemapper.Uniforms = `
    uniform float u_logMean;
    uniform float u_Brightness;
`;

ExponentialTonemapper.Code = `

    float lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    //float lum_TM = 1.0 - exp( -0.35 * lum/u_logMean );
    float lum_TM = 1.0 - exp( -u_Brightness * lum/u_logMean );

    color = color.rgb * lum_TM/lum;
`;

CORE.registerTonemapper( ExponentialTonemapper );

/**
 * xxxxxx PHOTOGRAPHIC TONE REPRODUCTION xxxxxxxx
 */

function PTRTonemapper()
{
    if(this.constructor != PTRTonemapper)
        throw("Use new");

    this.uniforms = {};
    this.params = {
        'GrayValue': {
            value: 0.18,
            options: {
                min: 0.01,
                max: 1.5,
                step: 0.01
            }
        }
    };
}

PTRTonemapper.Name = 'PTR';

PTRTonemapper.Uniforms = `
    uniform float u_logMean;
    uniform float u_maxLum;
    uniform float u_GrayValue;
`;

PTRTonemapper.Code = `

    float a = u_GrayValue;
    float scale = a/u_logMean;

    float lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    float lum_scaled = lum * scale;

    //float lum_TM = lum_scaled * (1.0 + lum_scaled/(u_maxLum * u_maxLum)) / (1.0 + lum_scaled) ;
    float lum_TM = lum_scaled / (1.0+lum_scaled);

    color = color.rgb * lum_TM/lum;
`;

CORE.registerTonemapper( PTRTonemapper );

